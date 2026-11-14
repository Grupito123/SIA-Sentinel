// src/services/notasService.js — notas e informes de avance en Firestore.
//
// Dos colecciones (reglas en firestore.rules):
//   notas/{id}     → el DOCENTE de la materia carga/edita TP · Eval · Exp
//                    (1..10); el alumno las lee en su boletín.
//   informes/{id}  → informe de avance TED / TEP / TEA por materia: lo carga
//                    el DOCENTE de la materia o el PRECEPTOR del curso.
//
// Reglas de la casa:
//  · Todo se consulta por IGUALDAD (cursoId + materiaId o alumnoId + periodo):
//    ninguna consulta necesita índice compuesto (el de alumnos ya nos mordió).
//  · `codigo` (PROG, MATE…) es la clave que vincula cada nota con su fila del
//    boletín: la materia en la BD puede llamarse "Programación" y en la malla
//    "Programación I" — el código es igual en los dos lados (colegio.js).
//  · alumnoId = id del documento de `alumnos/` (alu_2026-0001 o el uid del
//    registro público), que es exactamente lo que resuelven las reglas con
//    esMiAlumno().
//
// RN no tiene localStorage:Firestore es la única copia que sobrevive a un
// reinicio de la app, por eso las notas viven acá y no en gradesService.
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COLLECTIONS } from './firestore/helpers';

const NOTAS = collection(db, COLLECTIONS.GRADES);
const INFORMES = collection(db, COLLECTIONS.PROGRESS_REPORTS);

const TIPOS = ['tp', 'ev', 'ex'];

/** 1 → 'c1' (el periodo en el que guarda Firestore). */
export const periodoDe = (cuatri) => `c${cuatri}`;

/** 'PROG' en 4°2 para cualquier string ('PROG-4°2' o 'mat_4°2_prog'). */
export const codigoDeMateriaId = (materiaId) =>
  String(materiaId ?? '')
    .split('_')
    .pop()
    .replace(/-.*/, '')
    .toUpperCase();

const claveDeCodigo = (registro) =>
  (codigoDeMateriaId(registro.codigo) || codigoDeMateriaId(registro.materiaId) || '').toUpperCase();

const fechaHoy = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const notaId = ({ cursoId, materiaId, periodo, tipo, alumnoId }) =>
  `n__${cursoId}__${materiaId}__${periodo}__${tipo}__${alumnoId}`;

const informeId = ({ cursoId, materiaId, periodo, alumnoId }) =>
  `i__${cursoId}__${materiaId}__${periodo}__${alumnoId}`;

/* ------------------------------------------------------------------ NOTAS */

/**
 * Notas de UNA materia: { [alumnoId]: { tp, ev, ex } }.
 * Consulta por cursoId + materiaId + periodo (tres igualdades, sin índice).
 */
export async function notasDeMateria({ cursoId, materiaId, cuatri }) {
  const snapshot = await getDocs(
    query(
      NOTAS,
      where('cursoId', '==', cursoId),
      where('materiaId', '==', materiaId),
      where('periodo', '==', periodoDe(cuatri))
    )
  );
  const out = {};
  snapshot.docs.forEach((d) => {
    const n = d.data();
    if (!n.alumnoId || !TIPOS.includes(n.tipo)) return;
    out[n.alumnoId] = { ...(out[n.alumnoId] || {}), [n.tipo]: n.nota ?? null };
  });
  return out;
}

/**
 * Guarda (o limpia con null) UNA nota. El doc id es determinístico: volver a
 * cargar la misma celda pisa el valor anterior en vez de duplicar registros.
 * Solo puede escribirlo el docente de la materia (regla esMateriaDelCurso).
 */
export async function guardarNota({ cursoId, materiaId, codigo, materia, cuatri, alumnoId, tipo }, valor) {
  if (!TIPOS.includes(tipo)) throw new Error(`Tipo de nota inválido: ${tipo}`);
  await setDoc(doc(NOTAS, notaId({ cursoId, materiaId, periodo: periodoDe(cuatri), tipo, alumnoId })), {
    alumnoId,
    materiaId,
    cursoId,
    codigo: codigoDeMateriaId(codigo || materiaId),
    materia: materia || '',
    periodo: periodoDe(cuatri),
    tipo,
    nota: valor,
    fecha: fechaHoy(),
    descripcion: '',
    observaciones: '',
    actualizadoEn: serverTimestamp(),
  });
}

/** Notas de UN alumno en un curso: { [codigo]: { tp, ev, ex } } (lo ve el alumno). */
export async function notasDeAlumno({ cursoId, alumnoId, cuatri }) {
  const snapshot = await getDocs(
    query(
      NOTAS,
      where('cursoId', '==', cursoId),
      where('alumnoId', '==', alumnoId),
      where('periodo', '==', periodoDe(cuatri))
    )
  );
  const out = {};
  snapshot.docs.forEach((d) => {
    const n = d.data();
    if (!TIPOS.includes(n.tipo)) return;
    const codigo = claveDeCodigo(n);
    if (!codigo) return;
    out[codigo] = { ...(out[codigo] || {}), [n.tipo]: n.nota ?? null };
  });
  return out;
}

/* -------------------------------------------------------------- INFORMES */

/** Informes de UNA materia: { [alumnoId]: informe }. */
export async function informesDeMateria({ cursoId, materiaId, cuatri }) {
  const snapshot = await getDocs(
    query(
      INFORMES,
      where('cursoId', '==', cursoId),
      where('materiaId', '==', materiaId),
      where('periodo', '==', periodoDe(cuatri))
    )
  );
  const out = {};
  snapshot.docs.forEach((d) => {
    const inf = d.data();
    if (inf.alumnoId) out[inf.alumnoId] = inf;
  });
  return out;
}

/**
 * Guarda el informe TED/TEP/TEA de un alumno en una materia.
 * data: { clasif, desc, autor, autorRol } (fecha se agrega acá).
 */
export async function guardarInforme({ cursoId, materiaId, codigo, materia, cuatri, alumnoId }, data) {
  if (!['TED', 'TEP', 'TEA'].includes(data?.clasif)) {
    throw new Error('La clasificación del informe debe ser TED, TEP o TEA.');
  }
  await setDoc(doc(INFORMES, informeId({ cursoId, materiaId, periodo: periodoDe(cuatri), alumnoId })), {
    alumnoId,
    materiaId,
    cursoId,
    codigo: codigoDeMateriaId(codigo || materiaId),
    materia: materia || '',
    periodo: periodoDe(cuatri),
    clasif: data.clasif,
    desc: data.desc || '',
    autor: data.autor || '',
    autorRol: data.autorRol || '',
    fecha: data.fecha || fechaHoy(),
    actualizadoEn: serverTimestamp(),
  });
}

/** Informes de UN alumno en un curso: { [codigo]: informe } (lo ve el alumno). */
export async function informesDeAlumno({ cursoId, alumnoId, cuatri }) {
  const snapshot = await getDocs(
    query(
      INFORMES,
      where('cursoId', '==', cursoId),
      where('alumnoId', '==', alumnoId),
      where('periodo', '==', periodoDe(cuatri))
    )
  );
  const out = {};
  snapshot.docs.forEach((d) => {
    const inf = d.data();
    const codigo = claveDeCodigo(inf);
    if (codigo) out[codigo] = inf;
  });
  return out;
}
