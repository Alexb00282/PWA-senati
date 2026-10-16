# SENATI TaskHub PWA

Aplicación PWA con Angular 19 para gestionar tareas académicas, observaciones del instructor y entregas locales pendientes, con prioridad de funcionamiento offline y control honesto de sincronización.

## Requisitos

- Node.js compatible con Angular 19
- npm

## Ejecución local

```bash
npm install
npm start
```

Abre `http://localhost:4200/`.

## Mejoras implementadas

- Búsqueda por título o por curso con filtro combinable.
- Validación del formulario antes de guardar entregas.
- Bandeja local de entregas con contador, estados, detalle y eliminación confirmada.
- Indicador de conexión y mensajes transparentes: si no hay API real, la entrega queda en `PENDIENTE` y no se marca como sincronizada.
- Persistencia en IndexedDB con soporte para estados `PENDIENTE`, `SINCRONIZADO` y `ERROR`.
- Carga de tareas optimizada mediante filtros derivados y conteos directos evitando recorrer listas innecesarias.

## Compilación de producción

```bash
npm run build
```

## Comportamiento offline

- Las tareas se cargan desde `src/assets/data/tareas.json`.
- Las entregas y observaciones se guardan en IndexedDB (`senatiTaskDB`, `entregas_pendientes`).
- Mientras no exista un endpoint real, el sistema usa estado local y deja la entrega en `PENDIENTE` para evitar mensajes engañosos sobre sincronización.
