// CargaNotas — sección del staff dentro del Boletín:
//   docente (modo 'completo'):
//     1) elige la materia que DICTA en ese curso (las confirmadas en
//        materias.docenteId — las declaradas pero no confirmadas se avisan),
//     2) carga/edita las notas de cada alumno en tres columnas:
//        TP (trabajos prácticos) · Evaluaciones · Exposiciones (se guarda
//        al escribir, en Firestore),
//     3) por alumno, arma el informe de avance de ESA materia: TED / TEP / TEA
//        + descripción (los rangos numéricos solo los ve el docente; el alumno
//        ve la sigla y la descripción).
//   preceptor (modo 'informes'):
//     solo el paso 3, con las materias del curso: el preceptor también puede
//     cargar los informes de avance de su curso (regla esPreceptorDelCurso).
//
// Los alumnos salen de `alumnos/` (padrón real del curso) y las notas e
// informes de Firestore: en React Native no hay localStorage, así que la nube
// es la única copia que sobrevive a un reinicio de la app.
import { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getActiveUser } from '../services/authService';
import { alumnosDeCursoReal } from '../services/misAlumnos';
import { obtenerMaterias } from '../services/firestore/subjects';
import {
  notasDeMateria,
  guardarNota,
  informesDeMateria,
  guardarInforme as guardarInformeNube,
} from '../services/notasService';
import { nombreDeMateria } from '../utils/colegio';
import { nombreParaMostrar } from '../utils/nombres';
import { etiquetaCurso, INFORME_OPCIONES, TIPOS_NOTA } from '../utils/malla';

export default function CargaNotas({ curso, division, cuatri, modo = 'completo' }) {
  const { colors } = useTheme();
  const active = getActiveUser() || {};

  const cursoId = etiquetaCurso(curso, division);
  const esDocente = modo !== 'informes';

  const [materias, setMaterias] = useState([]);    // [{ id, nombre, codigo, cursoId }]
  const [materiaId, setMateriaId] = useState(null);
  const [cargandoMaterias, setCargandoMaterias] = useState(true);
  const [alumnos, setAlumnos] = useState([]);      // padrón real, orden por apellido
  const [notas, setNotas] = useState({});          // alumnoId -> { tp: '8', ev: '', ex: '' }
  const [invalidas, setInvalidas] = useState({});  // `${alumnoId}.${tipo}` -> true si no es válida
  const [avisoNota, setAvisoNota] = useState(null);
  const [informes, setInformes] = useState({});    // alumnoId -> informe guardado de ESTA materia
  const [abierto, setAbierto] = useState(null);    // alumnoId con el informe abierto
  const [clasif, setClasif] = useState(null);
  const [desc, setDesc] = useState('');
  const [aviso, setAviso] = useState(null);        // { tipo: 'ok'|'error', texto }

  const materiaSel = materias.find((m) => m.id === materiaId) || null;

  // Materias del curso (docente: SOLO las suyas · preceptor: todas las del
  // curso) y padrón real. Se recargan al cambiar de curso o de modo.
  useEffect(() => {
    let vivo = true;
    setCargandoMaterias(true);
    setMateriaId(null);
    setMaterias([]);

    const consulta = esDocente
      ? obtenerMaterias({ cursoId, docenteId: active.uid, activo: true })
      : obtenerMaterias({ cursoId, activo: true });
    consulta
      .then((lista) => {
        if (!vivo) return;
        const ordenadas = [...lista].sort((a, b) =>
          String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
        );
        setMaterias(ordenadas);
        setMateriaId(ordenadas[0]?.id ?? null);
      })
      .catch(() => {
        if (vivo) setMaterias([]);
      })
      .finally(() => {
        if (vivo) setCargandoMaterias(false);
      });

    alumnosDeCursoReal(cursoId)
      .then((al) => {
        if (vivo) setAlumnos(al);
      })
      .catch(() => {});

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId, modo, active.uid]);

  // Notas e informes guardados (se recargan al cambiar materia o cuatrimestre)
  useEffect(() => {
    setAbierto(null);
    setAviso(null);
    setAvisoNota(null);
    setClasif(null);
    setDesc('');
    setInvalidas({});
    if (!materiaId) {
      setNotas({});
      setInformes({});
      return undefined;
    }
    let vivo = true;
    const base = { cursoId, materiaId, cuatri };
    const pNotas = esDocente ? notasDeMateria(base).catch(() => null) : Promise.resolve({});
    Promise.all([pNotas, informesDeMateria(base).catch(() => null)]).then(([nube, inf]) => {
      if (!vivo) return;
      if (nube) {
        const mapa = {};
        Object.keys(nube).forEach((id) => {
          const comp = nube[id] || {};
          mapa[id] = {
            tp: comp.tp == null ? '' : String(comp.tp),
            ev: comp.ev == null ? '' : String(comp.ev),
            ex: comp.ex == null ? '' : String(comp.ex),
          };
        });
        setNotas(mapa);
      }
      setInformes(inf || {});
    });
    return () => {
      vivo = false;
    };
  }, [cursoId, materiaId, cuatri, esDocente]);

  const guardar = (valor, tipo, alumnoId) => {
    if (!materiaSel) return;
    guardarNota(
      {
        cursoId,
        materiaId: materiaSel.id,
        codigo: materiaSel.codigo,
        materia: materiaSel.nombre,
        cuatri,
        alumnoId,
        tipo,
      },
      valor
    )
      .then(() => setAvisoNota(null))
      .catch((e) =>
        setAvisoNota({
          tipo: 'error',
          texto: `No se pudo guardar: ${e?.code || e?.message || 'sin conexión'}`,
        })
      );
  };

  const onChangeNota = (id, tipo, texto) => {
    const limpio = String(texto).replace(/[^0-9]/g, '').slice(0, 2);
    setNotas((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [tipo]: limpio } }));

    const marca = `${id}.${tipo}`;
    if (limpio === '') {
      setInvalidas((prev) => ({ ...prev, [marca]: false }));
      guardar(null, tipo, id);
      return;
    }
    const n = parseInt(limpio, 10);
    const invalida = n < 1 || n > 10;
    setInvalidas((prev) => ({ ...prev, [marca]: invalida }));
    if (!invalida) guardar(n, tipo, id);
  };

  const toggleInforme = (alumno) => {
    const yaAbierto = abierto === alumno.id;
    setAviso(null);
    setAbierto(yaAbierto ? null : alumno.id);
    const guardado = informes[alumno.id];
    setClasif(!yaAbierto && guardado?.clasif ? guardado.clasif : null);
    setDesc(!yaAbierto && guardado?.desc ? guardado.desc : '');
  };

  const guardarInforme = async (alumno) => {
    if (!clasif) {
      setAviso({ tipo: 'error', texto: 'Elegí una opción: TED, TEP o TEA.' });
      return;
    }
    if (!materiaSel) return;
    const user = getActiveUser();
    const data = {
      clasif,
      desc: desc.trim(),
      autor:
        [user?.nombre, user?.apellido].filter(Boolean).join(' ') ||
        (user?.role === 'preceptor' ? 'Preceptoría' : 'Docente'),
      autorRol: user?.role || '',
      fecha: new Date().toLocaleDateString('es-AR'),
    };
    try {
      await guardarInformeNube(
        {
          cursoId,
          materiaId: materiaSel.id,
          codigo: materiaSel.codigo,
          materia: materiaSel.nombre,
          cuatri,
          alumnoId: alumno.id,
        },
        data
      );
      setInformes((prev) => ({
        ...prev,
        [alumno.id]: { ...data, materia: materiaSel.nombre, alumnoId: alumno.id },
      }));
      setAbierto(null);
      setClasif(null);
      setDesc('');
      setAviso({ tipo: 'ok', texto: `Informe guardado · ${nombreParaMostrar(alumno)}` });
    } catch (e) {
      setAviso({
        tipo: 'error',
        texto: `No se pudo guardar: ${e?.code || e?.message || 'sin permiso'}`,
      });
    }
  };

  const declarada = (active.materiasDeclaradas || []).find((b) => b.cursoId === cursoId);
  const pendientes = declarada
    ? (declarada.materias || []).map((codigo) => nombreDeMateria(codigo))
    : [];

  const s = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: 18,
          borderWidth: 1,
          padding: 16,
          marginBottom: 14,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 4,
        },
        label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, marginBottom: 10 },
        chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        chip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
        },
        chipText: { fontSize: 12.5, fontWeight: '600' },
        empty: { fontSize: 13, lineHeight: 19 },
        headRow: { flexDirection: 'row', alignItems: 'center' },
        iconBox: {
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        },
        title: { fontSize: 16, fontWeight: '800' },
        sub: { fontSize: 11.5, marginTop: 2 },
        divider: { height: 1, marginVertical: 12 },
        alumnoRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 9,
          gap: 6,
        },
        alumnoName: { fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 6 },
        tableHead: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingBottom: 4,
          marginBottom: 2,
        },
        headName: {
          flex: 1,
          paddingRight: 6,
          fontSize: 9.5,
          fontWeight: '800',
          letterSpacing: 0.6,
        },
        headTipo: {
          width: 56,
          textAlign: 'center',
          fontSize: 9.5,
          fontWeight: '800',
          letterSpacing: 0.4,
        },
        notaInput: {
          width: 56,
          borderWidth: 1,
          borderRadius: 10,
          paddingVertical: 6,
          paddingHorizontal: 4,
          fontSize: 15,
          fontWeight: '700',
          textAlign: 'center',
        },
        rangoHint: { fontSize: 11, lineHeight: 16, marginTop: 2 },
        hint: { fontSize: 11, marginTop: 8 },
        informeHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
        badge: {
          paddingHorizontal: 9,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1.5,
          marginRight: 8,
        },
        badgeText: { fontSize: 12, fontWeight: '800' },
        informeMeta: { fontSize: 11, marginTop: 3 },
        panel: {
          borderWidth: 1,
          borderRadius: 14,
          padding: 12,
          marginBottom: 8,
          gap: 8,
        },
        panelLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
        textArea: {
          minHeight: 76,
          borderWidth: 1,
          borderRadius: 12,
          padding: 10,
          fontSize: 13.5,
          textAlignVertical: 'top',
        },
        actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
        cancelBtn: {
          paddingVertical: 9,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
        },
        cancelText: { fontSize: 13, fontWeight: '600' },
        saveBtn: {
          paddingVertical: 9,
          paddingHorizontal: 16,
          borderRadius: 10,
        },
        saveText: { fontSize: 13, fontWeight: '800' },
        avisoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
        avisoText: { fontSize: 12, fontWeight: '600', flex: 1 },
      }),
    [colors]
  );

  const filaAviso = (av) =>
    av ? (
      <View style={s.avisoRow}>
        <MaterialCommunityIcons
          name={av.tipo === 'ok' ? 'check-circle-outline' : 'alert-circle-outline'}
          size={15}
          color={av.tipo === 'ok' ? colors.success : colors.error}
        />
        <Text style={[s.avisoText, { color: av.tipo === 'ok' ? colors.success : colors.error }]}>
          {av.texto}
        </Text>
      </View>
    ) : null;

  /* ------------------------------------------------------------------ UI */

  const materiaCard = (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[s.label, { color: colors.textSecondary }]}>
        {esDocente ? 'MATERIA A CARGAR' : 'MATERIA DEL INFORME'}
      </Text>
      {cargandoMaterias ? (
        <Text style={[s.empty, { color: colors.textSecondary }]}>Buscando materias…</Text>
      ) : materias.length ? (
        <View style={s.chipsRow}>
          {materias.map((m) => {
            const activeM = materiaId === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                activeOpacity={0.75}
                onPress={() => setMateriaId(m.id)}
                style={[
                  s.chip,
                  { borderColor: colors.border, backgroundColor: colors.surfaceVariant },
                  activeM && {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary + '1F',
                  },
                ]}
              >
                <Text
                  style={[
                    s.chipText,
                    { color: colors.textSecondary },
                    activeM && { color: colors.primary, fontWeight: '800' },
                  ]}
                >
                  {m.nombre}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : pendientes.length ? (
        <Text style={[s.empty, { color: colors.textSecondary }]}>
          {`Todavía no se confirmó ninguna materia tuya en ${cursoId}. Declaraste: ${pendientes.join(
            ', '
          )} — la institución confirma la asignación y acá van a aparecer.`}
        </Text>
      ) : (
        <Text style={[s.empty, { color: colors.textSecondary }]}>
          {esDocente
            ? `No tenés materias confirmadas en ${cursoId}. Si te registraste con materias, la institución todavía no confirmó la asignación.`
            : `Todavía no hay materias cargadas de ${cursoId} en la base.`}
        </Text>
      )}
    </View>
  );

  if (!materiaId) return materiaCard;

  return (
    <View>
      {materiaCard}

      {/* Notas (solo docente) */}
      {esDocente && (
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.headRow}>
            <View style={[s.iconBox, { backgroundColor: colors.primary + '22' }]}>
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={20}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.text }]}>Cargar notas</Text>
              <Text style={[s.sub, { color: colors.textSecondary }]}>
                {`${materiaSel?.nombre || ''} · ${cursoId} · ${cuatri}° cuatrimestre`}
              </Text>
            </View>
          </View>

          <View style={[s.divider, { backgroundColor: colors.border }]} />

          {/* Encabezado de columnas: TP | Evaluaciones | Exposiciones */}
          <View style={s.tableHead}>
            <Text style={[s.headName, { color: colors.textSecondary }]}>ALUMNO</Text>
            {TIPOS_NOTA.map((t) => (
              <Text key={t.key} style={[s.headTipo, { color: colors.textSecondary }]}>
                {t.corto}
              </Text>
            ))}
          </View>

          {alumnos.length ? (
            alumnos.map((al) => (
              <View key={al.id} style={s.alumnoRow}>
                <Text style={[s.alumnoName, { color: colors.text }]} numberOfLines={1}>
                  {nombreParaMostrar(al)}
                </Text>
                {TIPOS_NOTA.map((t) => {
                  const marca = `${al.id}.${t.key}`;
                  return (
                    <TextInput
                      key={t.key}
                      value={notas[al.id]?.[t.key] ?? ''}
                      onChangeText={(txt) => onChangeNota(al.id, t.key, txt)}
                      keyboardType="number-pad"
                      maxLength={2}
                      placeholder="—"
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.notaInput,
                        {
                          borderColor: invalidas[marca] ? colors.error : colors.border,
                          backgroundColor: colors.surfaceVariant,
                          color: invalidas[marca] ? colors.error : colors.text,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))
          ) : (
            <Text style={[s.empty, { color: colors.textSecondary, marginTop: 6 }]}>
              {`No hay alumnos cargados en ${cursoId} todavía.`}
            </Text>
          )}

          <Text style={[s.hint, { color: colors.textSecondary }]}>
            Cada columna es 1 a 10 · se guarda automáticamente · vacío = sin nota
          </Text>
          {filaAviso(avisoNota)}
        </View>
      )}

      {/* Informes de avance */}
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.headRow}>
          <View style={[s.iconBox, { backgroundColor: colors.primary + '22' }]}>
            <MaterialCommunityIcons
              name="file-document-edit-outline"
              size={20}
              color={colors.primary}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: colors.text }]}>Informes de avance</Text>
            <Text style={[s.sub, { color: colors.textSecondary }]}>
              {`${cursoId} · ${cuatri}° cuatrimestre · ${materiaSel?.nombre || ''}`}
            </Text>
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {alumnos.length ? (
          alumnos.map((al) => {
            const inf = informes[al.id];
            const colorClasif =
              INFORME_OPCIONES.find((o) => o.key === inf?.clasif)?.color || colors.textSecondary;
            const open = abierto === al.id;

            return (
              <View key={al.id}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => toggleInforme(al)}
                  style={s.informeHead}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.alumnoName, { color: colors.text, paddingRight: 0 }]}>
                      {nombreParaMostrar(al)}
                    </Text>
                    <Text style={[s.informeMeta, { color: colors.textSecondary }]}>
                      {inf
                        ? `${inf.materia || materiaSel?.nombre || ''} · ${inf.fecha}`
                        : 'Sin informe en este cuatrimestre'}
                    </Text>
                  </View>

                  {inf ? (
                    <View style={[s.badge, { borderColor: colorClasif, backgroundColor: colorClasif + '22' }]}>
                      <Text style={[s.badgeText, { color: colorClasif }]}>{inf.clasif}</Text>
                    </View>
                  ) : null}

                  <MaterialCommunityIcons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {open && (
                  <View
                    style={[
                      s.panel,
                      { borderColor: colors.primary + '66', backgroundColor: colors.surfaceVariant },
                    ]}
                  >
                    <Text style={[s.panelLabel, { color: colors.textSecondary }]}>
                      OPCIÓN DEL INFORME
                    </Text>
                    <View style={s.chipsRow}>
                      {INFORME_OPCIONES.map((op) => {
                        const activeO = clasif === op.key;
                        return (
                          <TouchableOpacity
                            key={op.key}
                            activeOpacity={0.75}
                            onPress={() => setClasif(op.key)}
                            style={[
                              s.chip,
                              { borderColor: colors.border, backgroundColor: colors.surface },
                              activeO && { borderColor: op.color, backgroundColor: op.color + '22' },
                            ]}
                          >
                            <Text
                              style={[
                                s.chipText,
                                { color: colors.textSecondary },
                                activeO && { color: op.color, fontWeight: '800' },
                              ]}
                            >
                              {op.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[s.rangoHint, { color: colors.textSecondary }]}>
                      {`Referencia para vos (el alumno NO ve los números): ${INFORME_OPCIONES.map(
                        (o) => `${o.label} ${o.rango}`
                      ).join(' · ')}`}
                    </Text>

                    <Text style={[s.panelLabel, { color: colors.textSecondary }]}>
                      DESCRIPCIÓN
                    </Text>
                    <TextInput
                      value={desc}
                      onChangeText={setDesc}
                      multiline
                      maxLength={280}
                      placeholder="Descripción breve del alumno en tu materia…"
                      placeholderTextColor={colors.textSecondary}
                      style={[
                        s.textArea,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          color: colors.text,
                        },
                      ]}
                    />

                    <View style={s.actions}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setAbierto(null)}
                        style={[
                          s.cancelBtn,
                          { borderColor: colors.border, backgroundColor: colors.surface },
                        ]}
                      >
                        <Text style={[s.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => guardarInforme(al)}
                        style={[s.saveBtn, { backgroundColor: colors.primary }]}
                      >
                        <Text style={[s.saveText, { color: colors.onPrimary || '#0B1628' }]}>
                          Guardar informe
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        ) : (
          <Text style={[s.empty, { color: colors.textSecondary }]}>
            {`No hay alumnos cargados en ${cursoId} todavía.`}
          </Text>
        )}

        {filaAviso(aviso)}
      </View>
    </View>
  );
}
