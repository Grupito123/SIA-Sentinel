# Sentinela — SIA (Sistema de Asistencia Inteligente)

Repositorio único que reúne los tres proyectos de Sentinel:

| Carpeta | Proyecto | Repo anterior |
|---|---|---|
| `centinela-system/` | App móvil Expo (SDK 58) + QR dinámico | `calo559/App-Sentinela` |
| `Firebase-Database/` | Reglas de Firestore, scripts de seed y utilidades (backend) | `Grupito123/Backend-Sentinel` |
| `web-sia/` | Página web (Vite + React + TypeScript) | `Grupito123/Pagina-sentinela` |

La historia de los tres repos originales está **fusionada** en este repo:
cada commit conserva su fecha, autor y mensaje (`git log -- centinela-system/`
muestra la línea de tiempo de la App, y así con los demás).

## Cómo correr

- **App**: `cd centinela-system && npm install && npx expo start -c`
- **Web**: `cd web-sia && npm install && npm run dev`
- **Backend/scripts**: `cd Firebase-Database/scripts && npm install && node <script>.js --credential <ruta al JSON de servicio>`

## Estructura de la base

- Cursos con id `año°división` (26 cursos de la técnica), colegio S.A. de Padua.
- Firestore `centinela-2b390`: `alumnos`, `cursos`, `materias`, `notas`,
  `informes` (TED/TEP/TEA), `asistencias`, `sesionesQR`, `avisos`.
- Reglas en `Firebase-Database/firestore.rules`.
