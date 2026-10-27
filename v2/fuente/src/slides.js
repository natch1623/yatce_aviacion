// Contenido editable de la presentación. Cada slide elige una toma (shot),
// un ambiente de luz (env, ver env.js) y dónde va el título (pos).
export const ACTS = {
  1: 'Acto 1 · En tierra',
  2: 'Acto 2 · Ascenso',
  3: 'Acto 3 · Crucero',
  4: 'Acto 4 · Descenso',
};

export const SLIDES = [
  { title: 'Práctica profesional', subtitle: 'Un recorrido de aprendizaje', kicker: 'Portada', act: 1, shot: 'gate', env: 'golden1', pos: 'left', cover: true },
  { title: 'Itinerario de vuelo', kicker: 'Agenda', act: 1, shot: 'taxi', env: 'golden2', pos: 'left' },
  { title: 'Introducción', act: 1, shot: 'climb', env: 'golden3', pos: 'right' },
  { title: 'Objetivo general', act: 2, shot: 'cruise:wide', env: 'morning', pos: 'left' },
  { title: 'Objetivos específicos', act: 2, shot: 'cruise:cockpit', env: 'morning2', pos: 'hud' },
  { title: 'Semana de observación', act: 2, shot: 'cruise:sideEscort', env: 'day1', pos: 'top' },
  { title: 'Observación en el área de counter', act: 2, shot: 'cruise:wing', env: 'day2', pos: 'right' },
  { title: 'Área de protocolo', act: 2, shot: 'cruise:front34', env: 'day3', pos: 'left' },
  { title: 'Observación del área de atención al cliente', act: 3, shot: 'cruise:tanker', env: 'among', pos: 'top' },
  { title: 'Observación: sala pública y sala restringida', act: 3, shot: 'cruise:belowBlue', env: 'afternoon', pos: 'left' },
  { title: 'Área restringida: plataforma', act: 3, shot: 'cruise:tail', env: 'goldenPM', pos: 'top' },
  { title: 'Embarque y desembarque de pasajeros', subtitle: 'Desde la aeronave hasta la terminal y viceversa', act: 3, shot: 'cruise:side', env: 'night', pos: 'top' },
  { title: 'Desafíos', act: 3, shot: 'cruise:wideAurora', env: 'night2', pos: 'left' },
  { title: 'Logros de mi práctica profesional', act: 3, shot: 'space', env: 'firstlight', pos: 'top' },
  { title: 'FODA', subtitle: 'Fortalezas · Oportunidades · Debilidades · Amenazas', act: 4, shot: 'parachute', env: 'dawn', pos: 'right' },
  { title: 'Conclusión', act: 4, shot: 'cruise:front34', env: 'sunrise', pos: 'left' },
  { title: 'Recomendaciones', act: 4, shot: 'cruise:sideSky', env: 'pink', pos: 'left' },
  { title: 'Registro fotográfico I', act: 4, shot: 'sea', env: 'morningLow', pos: 'left' },
  { title: 'Registro fotográfico II', act: 4, shot: 'cruise:chase', env: 'approach', pos: 'top' },
  { title: 'Gracias', subtitle: 'Fin del recorrido', kicker: 'Cierre', act: 4, shot: 'arrival', env: 'arrival', pos: 'left', cover: true },
];
