// Мастер (staff, 0022) сам ведёт свою публичную страницу: аватар и «о себе».
// Имя, активность и расписание по-прежнему меняет только владелец, поэтому
// сохраняем через RPC update_my_master_profile (0026), а не UPDATE masters.
import { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Camera } from 'lucide-react-native';
import PressableScale from '@/components/PressableScale';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { getMaster, uploadMasterPhotoFile, updateMyMasterProfile } from '@/utils/supabase/business';
import { t } from '@/utils/i18n';
import { friendlyError } from '@/utils/errors';

const BIO_MAX = 500;

export default function MyMasterProfile() {
  const masterId = useAuthStore((s) => s.masterId);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [experience, setExperience] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!masterId) {
        setLoading(false);
        return;
      }
      let cancelled = false;
      getMaster(masterId)
        .then((m) => {
          if (cancelled) return;
          setName(m.name);
          setBio(m.bio || '');
          setSpecialty(m.specialty || '');
          setExperience(m.experience_years === null ? '' : String(m.experience_years));
          setPhotoUrl(m.photo_url);
        })
        .catch((e) => !cancelled && setError(friendlyError(e, t('common.20'))))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [masterId])
  );

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError(t('common.62'));
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled) return;
    setUploading(true);
    setError(null);
    setInfo(null);
    try {
      const url = await uploadMasterPhotoFile(masterId, result.assets[0].base64);
      // Фото сохраняем сразу, как и у владельца: выбранная картинка не
      // должна пропасть, если мастер не нажмёт «Сохранить». Остальные поля
      // передаём как есть, иначе RPC затёр бы их пустыми.
      await updateMyMasterProfile({ bio, photoUrl: url, specialty, experienceYears: parsedYears() });
      setPhotoUrl(url);
      setInfo(t('my_master_profile.1'));
    } catch (e) {
      setError(friendlyError(e, t('common.61')));
    } finally {
      setUploading(false);
    }
  }

  // '' — опыт не указан; иначе целое число лет.
  function parsedYears() {
    return experience.trim() === '' ? null : Number(experience);
  }

  async function handleSave() {
    const years = parsedYears();
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 70)) {
      return setError(t('common.69'));
    }
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await updateMyMasterProfile({ bio, specialty, experienceYears: years });
      setInfo(t('common.64'));
    } catch (e) {
      setError(friendlyError(e, t('common.65')));
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
  if (!masterId) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{t('my_master_profile.2')}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <PressableScale style={styles.backButton} onPress={() => router.back()} accessibilityLabel={t('common.40')}>
          <ArrowLeft size={17} color={COLORS.ink} />
        </PressableScale>
        <Text style={styles.title}>{t('my_master_profile.3')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PressableScale style={styles.avatar} onPress={handlePickPhoto} disabled={uploading} accessibilityLabel={t('my_master_profile.4')}>
          {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.avatarImg} contentFit="cover" /> : null}
          <View style={styles.avatarOverlay}>
            {uploading ? <ActivityIndicator color={COLORS.white} /> : <Camera size={20} color={COLORS.white} />}
          </View>
        </PressableScale>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.hint}>{t('my_master_profile.5')}</Text>

        <View style={styles.row2}>
          <TextInput
            style={[styles.field, { flex: 2 }]}
            placeholder={t('my_master_profile.6')}
            placeholderTextColor={COLORS.sub}
            maxLength={40}
            value={specialty}
            onChangeText={setSpecialty}
          />
          <TextInput
            style={[styles.field, { flex: 1 }]}
            placeholder={t('common.70')}
            placeholderTextColor={COLORS.sub}
            keyboardType="number-pad"
            value={experience}
            onChangeText={setExperience}
          />
        </View>

        <Text style={styles.label}>{t('common.71')}</Text>
        <TextInput
          style={styles.textarea}
          placeholder={t('my_master_profile.7')}
          placeholderTextColor={COLORS.sub}
          multiline
          maxLength={BIO_MAX}
          value={bio}
          onChangeText={setBio}
        />
        <Text style={styles.counter}>
          {bio.length}/{BIO_MAX}
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {info && <Text style={styles.info}>{info}</Text>}

        <PressableScale style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveText}>{t('common.68')}</Text>}
        </PressableScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white, padding: SPACING.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, letterSpacing: -0.4 },
  content: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.sm, alignItems: 'stretch' },
  avatar: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, overflow: 'hidden', backgroundColor: COLORS.surface },
  avatarImg: { width: '100%', height: '100%' },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, backgroundColor: 'rgba(11,17,32,.18)' },
  name: { alignSelf: 'center', fontFamily: FONT.extrabold, fontSize: 20, color: COLORS.ink, marginTop: SPACING.sm },
  hint: { alignSelf: 'center', textAlign: 'center', fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginBottom: SPACING.md },
  label: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  row2: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  field: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  textarea: { minHeight: 120, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', fontFamily: FONT.medium, fontSize: TEXT_SIZE.xs, color: COLORS.sub },
  error: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger },
  info: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.success },
  saveButton: { height: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center', marginTop: SPACING.sm },
  saveText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.md, color: COLORS.white },
});
