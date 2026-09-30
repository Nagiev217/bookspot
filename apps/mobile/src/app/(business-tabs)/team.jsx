// Команда — реальные мастера. Переключатель "выходной" пишет/удаляет
// строку master_exceptions(type='day_off') на сегодня — реальные данные,
// не визуальная имитация. Полное редактирование (расписание, будущие
// выходные, активность) — на экране master/[masterId].
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import PressableScale from '@/components/PressableScale';
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { COLORS, SPACING, RADIUS, FONT, TEXT_SIZE } from '@/theme/tokens';
import { useAuthStore } from '@/utils/auth/store';
import { tintFor } from '@/utils/tint';
import { listAllMasters, createMaster, setMasterDayOff, isMasterOffOn, getMyBusiness } from '@/utils/supabase/business';
import { grantStaffAccess, revokeStaffAccess, resetPassword } from '@/utils/supabase/admin';
import CredentialsCard from '@/components/CredentialsCard';
import { bakuToday } from '@/components/DateTimeGrid';

export default function BusinessTeam() {
  const businessId = useAuthStore((s) => s.businessId);
  const [masters, setMasters] = useState([]);
  const [offToday, setOffToday] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [addingName, setAddingName] = useState(null); // null = форма закрыта
  const [saving, setSaving] = useState(false);
  const [grantFor, setGrantFor] = useState(null); // id мастера, которому вводим email
  const [grantEmail, setGrantEmail] = useState('');
  const [accessBusy, setAccessBusy] = useState(null);
  const [creds, setCreds] = useState(null); // { masterId, email, password } — показать один раз
  const [businessName, setBusinessName] = useState(null);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (businessId) getMyBusiness(businessId).then((b) => setBusinessName(b.name)).catch(() => {});
  }, [businessId]);

  const load = useCallback(() => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    setError(null);
    listAllMasters(businessId)
      .then(async (list) => {
        setMasters(list);
        const today = bakuToday();
        const flags = await Promise.all(list.map((m) => isMasterOffOn(m.id, today)));
        const map = {};
        list.forEach((m, i) => {
          map[m.id] = flags[i];
        });
        setOffToday(map);
        loadedOnce.current = true;
      })
      .catch((e) => setError(e.message || 'Не удалось загрузить'))
      .finally(() => setLoading(false));
  }, [businessId]);

  // Отдельно от useFocusEffect: с lazy:false вкладка монтируется сразу
  // после входа, но useFocusEffect не срабатывает, пока пользователь
  // реально не переключится на неё.
  useEffect(() => load(), [load]);

  useFocusEffect(load);

  async function toggle(masterId) {
    setTogglingId(masterId);
    const nextOff = !offToday[masterId];
    try {
      await setMasterDayOff(masterId, bakuToday(), nextOff);
      setOffToday((s) => ({ ...s, [masterId]: nextOff }));
    } catch (e) {
      setError(e.message || 'Не удалось изменить статус');
    } finally {
      setTogglingId(null);
    }
  }

  async function grantAccess(m) {
    const email = grantEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Проверьте email', 'Введите email мастера — он будет логином.');
      return;
    }
    setAccessBusy(m.id);
    try {
      const res = await grantStaffAccess({ businessId, masterId: m.id, email });
      setCreds({ masterId: m.id, ...res });
      setGrantFor(null);
      load();
    } catch (e) {
      Alert.alert('Не удалось выдать доступ', e.message);
    } finally {
      setAccessBusy(null);
    }
  }

  function resetAccess(m) {
    Alert.alert('Сбросить пароль?', `Старый пароль ${m.name} перестанет работать.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: async () => {
          setAccessBusy(m.id);
          try {
            const res = await resetPassword(m.user_id);
            setCreds({ masterId: m.id, ...res });
          } catch (e) {
            Alert.alert('Не удалось сбросить пароль', e.message);
          } finally {
            setAccessBusy(null);
          }
        },
      },
    ]);
  }

  function revokeAccess(m) {
    Alert.alert('Забрать доступ?', `${m.name} больше не сможет входить в приложение. Мастер и его записи останутся.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Забрать',
        style: 'destructive',
        onPress: async () => {
          setAccessBusy(m.id);
          try {
            await revokeStaffAccess(m.id);
            if (creds?.masterId === m.id) setCreds(null);
            load();
          } catch (e) {
            Alert.alert('Не удалось забрать доступ', e.message);
          } finally {
            setAccessBusy(null);
          }
        },
      },
    ]);
  }

  async function handleAddMaster() {
    const name = addingName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await createMaster({ businessId, name });
      setAddingName(null);
      load();
    } catch (e) {
      setError(e.message || 'Не удалось добавить мастера');
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
  if (!businessId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Нет доступа к бизнесу — войдите под аккаунтом владельца</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Команда</Text>
        <PressableScale style={styles.addButton} onPress={() => setAddingName((v) => (v === null ? '' : null))}>
          <Plus size={18} color={COLORS.white} />
        </PressableScale>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.list}>
        {addingName !== null && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.addInput}
              placeholder="Имя мастера"
              placeholderTextColor={COLORS.sub}
              value={addingName}
              onChangeText={setAddingName}
              autoFocus
            />
            <PressableScale style={styles.addSaveButton} onPress={handleAddMaster} disabled={saving}>
              {saving ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addSaveText}>Добавить</Text>}
            </PressableScale>
          </View>
        )}

        {masters.length === 0 ? (
          <Text style={styles.emptyText}>В этом бизнесе пока нет мастеров.</Text>
        ) : (
          masters.map((m) => {
            const isOn = !offToday[m.id];
            return (
              <View key={m.id} style={{ gap: SPACING.md }}>
              <PressableScale style={styles.card} onPress={() => router.push(`/master/${m.id}`)}>
                <View style={styles.cardTop}>
                  <View style={[styles.avatar, { backgroundColor: tintFor(m.id)[0] }]}>
                    {m.photo_url && <Image source={{ uri: m.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, !m.active && styles.nameOff]}>{m.name}</Text>
                    <Text style={styles.sub}>
                      {!m.active ? 'Отключён' : isOn ? 'Работает сегодня' : 'Выходной сегодня'}
                    </Text>
                  </View>
                  <PressableScale
                    disabled={togglingId === m.id}
                    style={[styles.switchTrack, { backgroundColor: isOn ? COLORS.indigo : '#E2E5EC', justifyContent: isOn ? 'flex-end' : 'flex-start' }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      toggle(m.id);
                    }}
                  >
                    {togglingId === m.id ? <ActivityIndicator size="small" color={COLORS.white} /> : <View style={styles.switchKnob} />}
                  </PressableScale>
                </View>

                {/* Доступ мастера в приложение: свой логин, видит только своё расписание. */}
                <View style={styles.access}>
                  {m.user_id ? (
                    <>
                      <Text style={styles.accessOn}>Есть доступ в приложение</Text>
                      <View style={styles.accessActions}>
                        <PressableScale style={styles.accessBtn} disabled={accessBusy === m.id} onPress={() => resetAccess(m)}>
                          <Text style={styles.accessBtnText}>Сбросить пароль</Text>
                        </PressableScale>
                        <PressableScale style={styles.accessBtn} disabled={accessBusy === m.id} onPress={() => revokeAccess(m)}>
                          <Text style={[styles.accessBtnText, { color: COLORS.danger }]}>Забрать доступ</Text>
                        </PressableScale>
                      </View>
                    </>
                  ) : grantFor === m.id ? (
                    <View style={styles.addForm}>
                      <TextInput
                        style={styles.addInput}
                        placeholder="Email мастера — будет логином"
                        placeholderTextColor={COLORS.sub}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        value={grantEmail}
                        onChangeText={setGrantEmail}
                        autoFocus
                      />
                      <PressableScale style={styles.addSaveButton} onPress={() => grantAccess(m)} disabled={accessBusy === m.id}>
                        {accessBusy === m.id ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.addSaveText}>Выдать</Text>}
                      </PressableScale>
                    </View>
                  ) : (
                    <PressableScale
                      style={styles.accessBtn}
                      onPress={() => {
                        setGrantFor(m.id);
                        setGrantEmail('');
                      }}
                    >
                      <Text style={styles.accessBtnText}>Выдать доступ в приложение</Text>
                    </PressableScale>
                  )}
                </View>
              </PressableScale>
              {creds?.masterId === m.id && (
                <CredentialsCard title={`Доступ для ${m.name}`} name={m.name} email={creds.email} password={creds.password} businessName={businessName} />
              )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.md, paddingTop: 56, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  title: { fontFamily: FONT.extrabold, fontSize: 25, color: COLORS.ink, letterSpacing: -0.5 },
  addButton: { width: 38, height: 38, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.danger, paddingHorizontal: SPACING.xl },
  emptyText: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub },
  list: { padding: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md },
  addForm: { flexDirection: 'row', gap: SPACING.sm },
  addInput: { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, padding: SPACING.md, fontFamily: FONT.regular, fontSize: TEXT_SIZE.md, color: COLORS.text },
  addSaveButton: { paddingHorizontal: SPACING.lg, borderRadius: RADIUS.sm, backgroundColor: COLORS.indigo, alignItems: 'center', justifyContent: 'center' },
  addSaveText: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.white },
  card: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: SPACING.lg },
  cardTop: { flexDirection: 'row', gap: 13, alignItems: 'center' },
  avatar: { width: 54, height: 54, borderRadius: RADIUS.md, overflow: 'hidden' },
  name: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.base, color: COLORS.ink },
  nameOff: { color: COLORS.sub },
  sub: { fontFamily: FONT.medium, fontSize: TEXT_SIZE.sm, color: COLORS.sub, marginTop: 3 },
  access: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, gap: SPACING.sm },
  accessOn: { fontFamily: FONT.semibold, fontSize: TEXT_SIZE.sm, color: COLORS.success },
  accessActions: { flexDirection: 'row', gap: SPACING.sm },
  accessBtn: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(11,17,32,.12)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.sm },
  accessBtnText: { fontFamily: FONT.bold, fontSize: TEXT_SIZE.sm, color: COLORS.ink },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, flexDirection: 'row', alignItems: 'center' },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.white },
});
