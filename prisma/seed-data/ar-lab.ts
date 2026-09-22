/**
 * The AR Instrument Lab's content.
 *
 * Only the Doppler radar is built for the first release, plus its short
 * refresher. The shape of this file is the shape of any future instrument, so
 * adding an Automatic Weather Station means adding an entry here and a part to
 * `scripts/build-ar-models.mjs` - not new code.
 *
 * `key` values match the node and material names in the .glb, which is how the
 * viewer knows which part of the model to highlight.
 *
 * The content is training material written for this demonstration. It describes
 * a Doppler weather radar in general terms and is not an IMD operating
 * procedure or a manual for any specific installation.
 */

export interface ARComponentSeed {
  key: string;
  name: string;
  description: string;
  hotspotPosition: { x: number; y: number; z: number };
  hotspotNormal?: { x: number; y: number; z: number };
  isInteractive?: boolean;
}

export interface ARTaskSeed {
  phase: 'TRAINING' | 'ASSESSMENT';
  type: 'IDENTIFY' | 'INSPECT';
  instruction: string;
  hint?: string;
  explanation?: string;
  /** `key` of the component that is the right answer. */
  answer: string;
  points?: number;
}

export interface ARModuleSeed {
  key: string;
  title: string;
  subtitle: string;
  description: string;
  objectives: string[];
  modelUrl: string;
  modelHeightM: number;
  competencyCode: string;
  /** Course key whose theory assessment this practical combines with. */
  courseKey?: string;
  kind: 'FULL_LAB' | 'REFRESHER';
  parentKey?: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  durationMinutes: number;
  passingScore: number;
  /** Share of the combined score from theory; the practical takes the rest. */
  theoryWeight: number;
  components: ARComponentSeed[];
  tasks: ARTaskSeed[];
}

/**
 * The parts of the radar, positioned in model space.
 *
 * The coordinates come from the geometry in `scripts/build-ar-models.mjs`: each
 * marker sits just outside the surface of its part, with a normal pointing away
 * from the model so the viewer can hide markers that have rotated out of sight.
 */
const RADAR_COMPONENTS: ARComponentSeed[] = [
  {
    key: 'antenna',
    name: 'Antenna',
    description:
      'The parabolic reflector and its feed horn. It forms the transmitted pulse into a narrow beam and collects the tiny fraction of energy scattered back by raindrops, hail and insects. Its size sets the beam width, and so how finely the radar can resolve a storm.',
    hotspotPosition: { x: 0, y: 1.005, z: 0.05 },
    hotspotNormal: { x: 0, y: 0.3, z: 0.95 },
  },
  {
    key: 'radome',
    name: 'Radome',
    description:
      'The dome enclosing the antenna. It keeps wind, rain and ice off the reflector so the antenna can point accurately in bad weather - which is exactly when the radar matters most - while being nearly transparent to the radar beam.',
    hotspotPosition: { x: 0, y: 1.185, z: 0.06 },
    hotspotNormal: { x: 0, y: 0.92, z: 0.39 },
  },
  {
    key: 'rotator',
    name: 'Rotator (pedestal)',
    description:
      'The drive that turns the antenna through 360 degrees in azimuth and tilts it in elevation. A volume scan is built from several rotations at increasing elevation angles, so the accuracy of this drive decides where in the sky each measurement actually came from.',
    hotspotPosition: { x: 0.058, y: 0.89, z: 0.02 },
    hotspotNormal: { x: 0.93, y: 0, z: 0.35 },
  },
  {
    key: 'receiver',
    name: 'Receiver',
    description:
      'The cabinet that amplifies the returned signal and turns it into numbers. Echo strength becomes reflectivity, and the frequency shift of the return becomes radial velocity - the measurement that makes a radar "Doppler".',
    hotspotPosition: { x: -0.14, y: 0.9, z: 0.13 },
    hotspotNormal: { x: -0.55, y: 0.2, z: 0.81 },
  },
  {
    key: 'tower',
    name: 'Tower',
    description:
      'The structure carrying the antenna above its surroundings. Height buys an unobstructed horizon: an obstruction near the tower casts a permanent shadow in the data, so siting and height are decided before anything else.',
    hotspotPosition: { x: 0, y: 0.45, z: 0.075 },
    hotspotNormal: { x: 0, y: 0, z: 1 },
  },
  {
    key: 'controlUnit',
    name: 'Radar control unit',
    description:
      'The building at the base holding the transmitter, the signal processor and the control and communications equipment. Scan strategies are set here, and the products that reach the forecast office leave from here.',
    hotspotPosition: { x: 0.27, y: 0.125, z: 0.145 },
    hotspotNormal: { x: 0, y: 0.2, z: 0.98 },
  },
  {
    key: 'platform',
    name: 'Platform',
    description: 'The working platform at the top of the tower, giving technicians safe access to the antenna and the equipment cabinets.',
    hotspotPosition: { x: 0.12, y: 0.862, z: 0.12 },
    hotspotNormal: { x: 0, y: 1, z: 0 },
    isInteractive: false,
  },
  {
    key: 'base',
    name: 'Foundation',
    description: 'The concrete foundation. A radar tower must stay rigid in high wind, because a tower that flexes points the beam somewhere other than where the data says.',
    hotspotPosition: { x: 0.17, y: 0.04, z: 0.17 },
    hotspotNormal: { x: 0, y: 1, z: 0 },
    isInteractive: false,
  },
];

export const AR_MODULES: ARModuleSeed[] = [
  {
    key: 'doppler-radar',
    title: 'Doppler Radar Lab',
    subtitle: 'AR practical',
    description:
      'Place a Doppler weather radar in the room in front of you, take it apart with your finger, and show that you can name the parts that matter when something goes wrong. The practical score combines with your theory result to update your Radar Meteorology competency.',
    objectives: [
      'Identify the major components of a Doppler weather radar.',
      'Explain what the antenna and the radome each do.',
      'Recognise the rotator and what its accuracy affects.',
      'Trace the signal path from the antenna to the forecast office.',
      'Complete a simulated first-line inspection.',
    ],
    modelUrl: '/models/doppler-radar.glb',
    modelHeightM: 1.2,
    competencyCode: 'RADAR',
    // Identifying components is fundamentals material, and this course has no
    // prerequisites, so the practical is reachable by anyone starting on radar.
    courseKey: 'radar-fundamentals',
    kind: 'FULL_LAB',
    difficulty: 'INTERMEDIATE',
    durationMinutes: 10,
    passingScore: 70,
    theoryWeight: 0.4,
    components: RADAR_COMPONENTS,
    tasks: [
      // ---- guided training: hints allowed, nothing is scored -------------------------------
      {
        phase: 'TRAINING',
        type: 'IDENTIFY',
        instruction: 'Find the radar antenna.',
        hint: 'It is the curved reflector inside the dome. Use "See inside" to hide the radome.',
        explanation: 'The antenna is the reflector and feed horn together. Everything else on the tower exists to point it, protect it or read what it collects.',
        answer: 'antenna',
      },
      {
        phase: 'TRAINING',
        type: 'IDENTIFY',
        instruction: 'Find the radome.',
        hint: 'The large dome at the top of the tower.',
        explanation: 'The radome protects the antenna without blocking the beam, so the radar keeps pointing accurately in the weather it exists to measure.',
        answer: 'radome',
      },
      {
        phase: 'TRAINING',
        type: 'IDENTIFY',
        instruction: 'Find the radar control unit.',
        hint: 'Not on the tower - look at ground level.',
        explanation: 'The control unit holds the transmitter, the processor and the link to the forecast office.',
        answer: 'controlUnit',
      },
      {
        phase: 'TRAINING',
        type: 'INSPECT',
        instruction: 'Begin the simulated inspection. The antenna is reported to be turning unevenly. Which component would you look at first?',
        hint: 'Something has to turn the antenna.',
        explanation: 'Uneven rotation points at the rotator, the drive that turns the antenna in azimuth and tilts it in elevation.',
        answer: 'rotator',
      },

      // ---- assessment: no hints, no answers, scored ---------------------------------------
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that forms the transmitted beam and collects the returned energy.',
        explanation: 'The antenna. Its diameter sets the beam width and therefore how finely the radar resolves a storm.',
        answer: 'antenna',
        points: 20,
      },
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that protects the antenna from the weather without blocking the beam.',
        explanation: 'The radome. It is nearly transparent to the radar beam, which is why the antenna can be shielded and still work.',
        answer: 'radome',
        points: 20,
      },
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that turns the antenna through 360 degrees in azimuth.',
        explanation: 'The rotator. Its accuracy decides where in the sky each measurement is recorded as having come from.',
        answer: 'rotator',
        points: 20,
      },
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that amplifies the returned signal and measures its frequency shift.',
        explanation: 'The receiver. The frequency shift it measures is what turns an ordinary weather radar into a Doppler radar.',
        answer: 'receiver',
        points: 20,
      },
      {
        phase: 'ASSESSMENT',
        type: 'INSPECT',
        instruction:
          'Simulated fault. The forecast office reports that no radar products have arrived for twenty minutes, but a site visit confirms the antenna is still turning normally. Which component would you inspect first?',
        explanation:
          'The control unit. The antenna turning rules out the rotator and the tower; products not arriving points at the processing and communications equipment at the base.',
        answer: 'controlUnit',
        points: 20,
      },
    ],
  },

  {
    key: 'doppler-radar-refresher',
    title: 'Radar Refresher',
    subtitle: 'AR refresher',
    description:
      'A short practical to bring a radar competency that has faded back up to date. Three tasks on the same model, about five minutes. It is recommended automatically when the freshness engine reports your Radar Meteorology competency as at risk.',
    objectives: ['Re-identify the antenna and the radome.', 'Complete one inspection decision.', 'Record fresh practical evidence against Radar Meteorology.'],
    modelUrl: '/models/doppler-radar.glb',
    modelHeightM: 1.2,
    competencyCode: 'RADAR',
    // Identifying components is fundamentals material, and this course has no
    // prerequisites, so the practical is reachable by anyone starting on radar.
    courseKey: 'radar-fundamentals',
    kind: 'REFRESHER',
    parentKey: 'doppler-radar',
    difficulty: 'INTERMEDIATE',
    durationMinutes: 5,
    passingScore: 70,
    // A refresher is judged on the practical alone: it is about whether the skill is still there.
    theoryWeight: 0,
    components: RADAR_COMPONENTS,
    tasks: [
      {
        phase: 'TRAINING',
        type: 'IDENTIFY',
        instruction: 'Warm-up: find the antenna.',
        hint: 'Inside the dome. Use "See inside" to hide the radome.',
        answer: 'antenna',
      },
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that forms the beam and collects the returned energy.',
        explanation: 'The antenna.',
        answer: 'antenna',
        points: 34,
      },
      {
        phase: 'ASSESSMENT',
        type: 'IDENTIFY',
        instruction: 'Select the component that protects the antenna from the weather.',
        explanation: 'The radome.',
        answer: 'radome',
        points: 33,
      },
      {
        phase: 'ASSESSMENT',
        type: 'INSPECT',
        instruction: 'Simulated fault: the antenna is turning unevenly. Which component would you inspect first?',
        explanation: 'The rotator, the drive that turns the antenna.',
        answer: 'rotator',
        points: 33,
      },
    ],
  },
];
