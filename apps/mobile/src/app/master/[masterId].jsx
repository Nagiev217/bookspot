// Карточка мастера: имя/активность, недельное расписание (минуты от
// полуночи, конвенция get_availability) и будущие выходные. Перерыв в
// расписании — это просто второй интервал в том же дне недели, отдельного
// типа "custom_hours" для него не нужно.
import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import PressableScale from '@/components/PressableScale';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, X, Camera } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import {
  getMaster,
  updateMaster,
  getMasterSchedule,
  replaceMasterSchedule,
  listUpcomingDaysOff,
  setMasterDayOff,
  uploadMasterPhoto,
} from '@/utils/supabase/business';
import { bakuToday, addDaysISO } from '@/components/DateTimeGrid';

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMin(hhmm) {
  const m = HHMM_RE.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function toHHMM(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function emptyWeek() {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export default function MasterDetail() {
  const { masterId } = useLocalSearchParams();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [experience, setExperience] = useState('');
  const [active, setActive] = useState(true);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [week, setWeek] = useState(emptyWeek());
  const [daysOff, setDaysOff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      Promise.all([getMaster(masterId), getMasterSchedule(masterId), listUpcomingDaysOff(masterId, bakuToday())])
        .then(([master, schedule, upcoming]) => {
          if (cancelled) return;
          setName(master.name);
          setBio(master.bio || '');
          setSpecialty(master.specialty || '');
          setExperience(master.experience_years === null ? '' : String(master.experience_years));
          setActive(master.active);
          setPhotoUrl(master.photo_url);
          const w = emptyWeek();
          schedule.forEach((row) => {
            w[row.day_of_week] = [...(w[row.day_of_week] || []), { start: toHHMM(row.start_min), end: toHHMM(row.end_min) }];
          });
          setWeek(w);
          setDaysOff(upcoming);
        })
        .catch((e) => !cancelled && setError(e.message || 'Не удалось загрузить'))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [masterId])
  );

  function addRange(dow) {
    setWeek((w) => ({ ...w, [dow]: [...w[dow], { start: '09:00', end: '18:00' }] }));
  }
  function removeRange(dow, idx) {
    setWeek((w) => ({ ...w, [dow]: w[dow].filter((_, i) => i !== idx) }));
  }
  function updateRange(dow, idx, field, value) {
    setWeek((w) => ({ ...w, [dow]: w[dow].map((r, i) => (i === idx ? { ...r, [field]: value } : r)) }));
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('Нет доступа к галерее');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadMasterPhoto(masterId, result.assets[0].base64);
      setPhotoUrl(url);
    } catch (e) {
      setError(e.message || 'Не удалось загрузить фото');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveProfile() {
    setError(null);
    setInfo(null);
    if (!name.trim()) return setError('Введите имя');
    const years = experience.trim() === '' ? null : Number(experience);
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 70)) return setError('Опыт — целое число лет от 0 до 70');
    setSaving(true);
    try {
      await updateMaster(masterId, {
        name: name.trim(),
        active,
        bio: bio.trim(),
        specialty: specialty.trim(),
        experience_years: years,
      });
      setInfo('Сохранено');
    } catch (e) {
      setError(e.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSchedule() {
    setError(null);
    setInfo(null);
    const rows = [];
    for (const dow of Object.keys(week)) {
      for (const r of week[dow]) {
        const start = toMin(r.start);
        const end = toMin(r.end);
        if (start === null || end === null) return setError('Время — в формате ЧЧ:ММ');
        if (end <= start) return setError('Конец интервала должен быть позже начала');
        rows.push({ day_of_week: Number(dow), start_min: start, end_min: end });
      }
    }
    setSaving(true);
    try {
      await replaceMasterSchedule(masterId, rows);
      setInfo('Расписание сохранено');
    } catch (e) {
      setError(e.message || 'Не удалось сохранить расписание');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDayOff(dateISO) {
    const isOff = daysOff.includes(dateISO);
    setSaving(true);
    try {
      await setMasterDayOff(masterId, dateISO, !isOff);
      setDaysOff((prev) => (isOff ? prev.filter((d) => d !== dateISO) : [...prev, dateISO].sort()));
    } catch (e) {
      setError(e.message || 'Не удалось изменить выходной');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.indigo} />
      </View>
    );
  }

  const nextDays = Array.from({ length: 14 }, (_, i) => addDaysISO(bakuToday(), i));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>Мастер</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <PressableScale style={styles.photoBox} onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photoImg} contentFit="cover" /> : null}
          <View style={styles.photoOverlay}>
            {uploadingPhoto ? <ActivityIndicator color={COLORS.white} /> : <Camera size={18} color={COLORS.white} />}
          </View>
        </PressableScale>

        <TextInput style={styles.input} placeholder="Имя" placeholderTextColor={COLORS.sub} value={name} onChangeText={setName} />
        <View style={styles.row2}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="Специализация: барбер, колорист…"
            placeholderTextColor={COLORS.sub}
            maxLength={40}
            value={specialty}
            onChangeText={setSpecialty}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Опыт, лет"
            placeholderTextColor={COLORS.sub}
            keyboardType="number-pad"
            value={experience}
            onChangeText={setExperience}
          />
        </View>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="О себе: опыт, специализация — клиенты увидят это на странице мастера"
          placeholderTextColor={COLORS.sub}
          multiline
          maxLength={500}
          value={bio}
          onChangeText={setBio}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Активен (принимает записи)</Text>
          <Switch value={active} onValueChange={setActive} trackColor={{ true: COLORS.indigo }} />
        </View>
        <PressableScale style={styles.smallSaveButton} onPress={handleSaveProfile} disabled={saving}>
          <Text style={styles.smallSaveText}>Сохранить</Text>
        </PressableScale>

        <Text style={styles.sectionTitle}>Расписание по дням недели</Text>
        {Object.keys(week)
          .map(Number)
          .sort((a, b) => a - b)
          .map((dow) => (
            <View key={dow} style={styles.dayBlock}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{DOW[dow]}</Text>
                <PressableScale style={styles.addRangeButton} onPress={() => addRange(dow)}>
                  <Plus size={14} color={COLORS.indigo} />
                </PressableScale>
              </View>
              {week[dow].length === 0 ? (
                <Text style={styles.dayOffText}>Выходной</Text>
              ) : (
                week[dow].map((r, idx) => (
                  <View key={idx} style={styles.rangeRow}>
                    <TextInput style={styles.timeInput} value={r.start} onChangeText={(v) => updateRange(dow, idx, 'start', v)} placeholder="09:00" />
                    <Text style={styles.rangeDash}>—</Text>
                    <TextInput style={styles.timeInput} value={r.end} onChangeText={(v) => updateRange(dow, idx, 'end', v)} placeholder="18:00" />
                    <PressableScale onPress={() => removeRange(dow, idx)} style={styles.removeRangeButton}>
                      <X size={14} color={COLORS.sub} />
                    </PressableScale>
                  </View>
                ))
              )}
            </View>
          ))}
        <PressableScale style={styles.saveButton} onPress={handleSaveSchedule} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveButtonText}>Сохранить расписание</Text>}
        </PressableScale>

        <Text style={styles.sectionTitle}>Выходные на ближайшие 2 недели</Text>
        <View style={styles.dateGrid}>
          {nextDays.map((iso) => {
            const isOff = daysOff.includes(iso);
            return (
              <PressableScale key={iso} disabled={saving} style={[styles.dateCell, isOff && styles.dateCellOff]} onPress={() => toggleDayOff(iso)}>
                <Text style={[styles.dateDow, isOff && styles.dateTextOff]}>{DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]}</Text>
                <Text style={[styles.dateNum, isOff && styles.dateTextOff]}>{iso.slice(8, 10)}</Text>
              </PressableScale>
            );
          })}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
  photoBox: { alignSelf: 'center', width: 90, height: 90, borderRadius: 45, backgroundColor: COLORS.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  // Явные размеры вместо absoluteFillObject: expo-image ничего не рисует,
  // когда размер задан только парой left/right + top/bottom без width/height.
  // photoBox задаёт размер сам, поэтому 100% — тот же результат, но рабочий.
  photoImg: { width: '100%', height: '100%' },
  photoOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,17,32,.35)', ...StyleSheet.absoluteFillObject },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: SPACING.sm },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.text },
  smallSaveButton: { alignSelf: 'flex-start', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface },
  smallSaveText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  sectionTitle: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.md, color: COLORS.ink, marginTop: SPACING.md },
  dayBlock: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, padding: SPACING.md, gap: SPACING.sm },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  addRangeButton: { width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.indigo50, alignItems: 'center', justifyContent: 'center' },
  dayOffText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  timeInput: { width: 66, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.sm, fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.text, textAlign: 'center' },
  rangeDash: { color: COLORS.sub },
  removeRangeButton: { marginLeft: 'auto', padding: SPACING.sm },
  saveButton: { height: 48, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  saveButtonText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
  dateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  dateCell: { width: '22.5%', paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  dateCellOff: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  dateDow: { fontFamily: FONT.semibold, fontSize: 10.5, color: COLORS.ink, opacity: 0.6 },
  dateNum: { fontFamily: FONT.extrabold, fontSize: 15, color: COLORS.ink, marginTop: 5 },
  dateTextOff: { color: COLORS.white, opacity: 1 },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success },
});
