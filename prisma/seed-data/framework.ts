/**
 * IMD competency framework used by the demo seed: departments, organisational
 * job roles, the eight core competencies, and which role requires what.
 * Everything here is data an administrator can edit in the running application.
 */

export const DEPARTMENTS = [
  { code: 'FC', name: 'Forecasting', description: 'National and regional weather forecasting and warning services.' },
  { code: 'RD', name: 'Radar Operations', description: 'Doppler Weather Radar network operations, maintenance and interpretation.' },
  { code: 'SAT', name: 'Satellite Services', description: 'INSAT/Meteosat data reception, processing and satellite meteorology.' },
  { code: 'CLR', name: 'Climate Research', description: 'Climate monitoring, long-range forecasting and climate services.' },
  { code: 'NWP', name: 'Numerical Weather Prediction', description: 'Operational models, data assimilation and forecast verification.' },
  { code: 'CDW', name: 'Cyclone & Disaster Warning', description: 'Tropical cyclone tracking, warnings and disaster-management liaison.' },
  { code: 'HRD', name: 'Capacity Building', description: 'Training, learning strategy and human resource development.' },
] as const;

export type DepartmentCode = (typeof DEPARTMENTS)[number]['code'];

export const COMPETENCIES = [
  {
    code: 'FORECASTING',
    name: 'Weather Forecasting',
    category: 'Core Operations',
    description: 'Analyse observations and model guidance to produce accurate, timely and well-communicated weather forecasts and warnings.',
    levelDescriptors: {
      foundation: 'Reads surface and upper-air charts and prepares routine forecasts with supervision.',
      developing: 'Builds a synoptic picture and issues district-level forecasts independently.',
      proficient: 'Integrates observations, radar, satellite and NWP to forecast high-impact weather with quantified uncertainty.',
      expert: 'Leads forecast operations, mentors forecasters and improves forecast practice.',
    },
  },
  {
    code: 'RADAR',
    name: 'Radar Meteorology',
    category: 'Core Operations',
    description: 'Operate and interpret weather radar: reflectivity and velocity products, quality control, storm structure and nowcasting.',
    levelDescriptors: {
      foundation: 'Recognises basic reflectivity products and common non-meteorological echoes.',
      developing: 'Interprets reflectivity and radial velocity to identify convective systems.',
      proficient: 'Diagnoses severe-weather signatures and issues radar-based nowcasts.',
      expert: 'Designs radar applications, validates products and trains operators.',
    },
  },
  {
    code: 'SATELLITE',
    name: 'Satellite Meteorology',
    category: 'Core Operations',
    description: 'Interpret multi-spectral geostationary and polar-orbiting satellite imagery and derived products for analysis and monitoring.',
    levelDescriptors: {
      foundation: 'Distinguishes cloud types in visible and infrared imagery.',
      developing: 'Uses multi-channel imagery and derived products for cloud and rainfall analysis.',
      proficient: 'Applies satellite data to cyclone intensity estimation and severe-weather monitoring.',
      expert: 'Develops new products and validates retrievals against ground truth.',
    },
  },
  {
    code: 'CLIMATE',
    name: 'Climate Analysis',
    category: 'Climate & Research',
    description: 'Analyse long-term observations to describe climate variability, trends and extremes and to support climate services.',
    levelDescriptors: {
      foundation: 'Computes basic climatologies and anomalies.',
      developing: 'Performs trend and variability analysis with appropriate statistics.',
      proficient: 'Attributes variability to climate drivers and communicates uncertainty.',
      expert: 'Leads climate assessments and long-range forecasting research.',
    },
  },
  {
    code: 'NWP',
    name: 'Numerical Weather Prediction',
    category: 'Modelling & Prediction',
    description: 'Understand, run and evaluate numerical weather prediction systems, ensembles and data assimilation.',
    levelDescriptors: {
      foundation: 'Reads model output and knows the main model products.',
      developing: 'Compares deterministic guidance and identifies systematic model errors.',
      proficient: 'Uses ensembles and verification to improve forecast guidance.',
      expert: 'Develops and tunes model components and assimilation systems.',
    },
  },
  {
    code: 'ATMOSPHERIC',
    name: 'Atmospheric Science',
    category: 'Scientific Foundations',
    description: 'Apply the physics and dynamics of the atmosphere - thermodynamics, circulation and cloud processes - to operational problems.',
    levelDescriptors: {
      foundation: 'Explains basic thermodynamics, stability and pressure-wind relationships.',
      developing: 'Applies quasi-geostrophic reasoning and thermodynamic diagrams to real cases.',
      proficient: 'Diagnoses mesoscale and synoptic dynamics behind significant weather.',
      expert: 'Advances scientific understanding and guides research programmes.',
    },
  },
  {
    code: 'DATA',
    name: 'Meteorological Data Analysis',
    category: 'Data & Digital',
    description: 'Clean, analyse and visualise meteorological data with reproducible, scripted workflows.',
    levelDescriptors: {
      foundation: 'Loads and inspects common weather data formats.',
      developing: 'Automates cleaning, statistics and plotting with scripts.',
      proficient: 'Builds reproducible pipelines and decision-support dashboards.',
      expert: 'Designs data platforms and mentors analysts.',
    },
  },
  {
    code: 'DRM',
    name: 'Disaster Risk Management',
    category: 'Public Safety',
    description: 'Translate hazard forecasts into impact-based warnings and coordinate with disaster-management authorities.',
    levelDescriptors: {
      foundation: 'Knows the warning colour codes and dissemination channels.',
      developing: 'Prepares impact statements and works with district authorities.',
      proficient: 'Runs impact-based forecasting and multi-agency briefings.',
      expert: 'Leads national preparedness planning and post-event reviews.',
    },
  },
] as const;

export type CompetencyCode = (typeof COMPETENCIES)[number]['code'];

/**
 * Freshness policies for the demonstration.
 *
 * These half-lives and recertification intervals are a plausible simulation for
 * showing how the readiness engine behaves; they are NOT official IMD policy, and
 * every row is stored with `isSimulation: true` so the interface says so. An
 * administrator can change any of them, or remove a policy to stop a competency
 * decaying at all.
 *
 * The reasoning behind the shipped values: hands-on, tool-driven skills fade
 * fastest without practice (radar, satellite interpretation), model and analysis
 * work somewhat slower, and broad knowledge-based competencies slowest.
 */
export const DECAY_POLICIES: {
  code: CompetencyCode;
  halfLifeDays: number;
  minimumSafeLevel: number;
  recertificationIntervalDays: number;
  criticality: number;
  notes: string;
}[] = [
  { code: 'RADAR', halfLifeDays: 180, minimumSafeLevel: 35, recertificationIntervalDays: 365, criticality: 5, notes: 'Hands-on product interpretation fades quickly without regular duty on the radar desk.' },
  { code: 'FORECASTING', halfLifeDays: 270, minimumSafeLevel: 35, recertificationIntervalDays: 365, criticality: 5, notes: 'Practised daily by operational forecasters, so it decays more slowly than specialist tools.' },
  { code: 'SATELLITE', halfLifeDays: 210, minimumSafeLevel: 30, recertificationIntervalDays: 548, criticality: 4, notes: 'Imagery interpretation needs regular exposure to current sensors and products.' },
  { code: 'NWP', halfLifeDays: 240, minimumSafeLevel: 30, recertificationIntervalDays: 548, criticality: 4, notes: 'Model configurations change, so unused knowledge dates as much as it fades.' },
  { code: 'DRM', halfLifeDays: 300, minimumSafeLevel: 35, recertificationIntervalDays: 365, criticality: 5, notes: 'Warning and liaison procedures must stay current for the cyclone season.' },
  { code: 'DATA', halfLifeDays: 300, minimumSafeLevel: 25, recertificationIntervalDays: 730, criticality: 3, notes: 'Tooling changes gradually; skills persist reasonably well between uses.' },
  { code: 'ATMOSPHERIC', halfLifeDays: 540, minimumSafeLevel: 25, recertificationIntervalDays: 1095, criticality: 3, notes: 'Underlying physics is durable knowledge and decays slowly.' },
  { code: 'CLIMATE', halfLifeDays: 480, minimumSafeLevel: 25, recertificationIntervalDays: 730, criticality: 3, notes: 'Long-range analysis practice is periodic rather than daily.' },
];

/** [competency code, required level 0-100, importance 1-5] */
type Requirement = [CompetencyCode, number, number];

export const ROLES: { code: string; name: string; description: string; criticality: number; requirements: Requirement[] }[] = [
  {
    code: 'SWF',
    name: 'Severe Weather Forecaster',
    description: 'Issues forecasts and warnings for high-impact weather at a regional forecasting centre.',
    criticality: 4,
    requirements: [
      ['FORECASTING', 85, 5],
      ['RADAR', 80, 4],
      ['SATELLITE', 70, 3],
      ['NWP', 70, 4],
      ['ATMOSPHERIC', 70, 3],
      ['DATA', 65, 3],
      ['CLIMATE', 60, 2],
      ['DRM', 70, 4],
    ],
  },
  {
    code: 'RDM',
    name: 'Radar Meteorologist',
    description: 'Operates the Doppler Weather Radar network and provides radar-based nowcasts.',
    criticality: 5,
    requirements: [
      ['RADAR', 90, 5],
      ['FORECASTING', 70, 3],
      ['ATMOSPHERIC', 70, 3],
      ['DATA', 70, 4],
      ['SATELLITE', 60, 2],
      ['DRM', 60, 3],
    ],
  },
  {
    code: 'SATM',
    name: 'Satellite Meteorologist',
    description: 'Processes and interprets satellite data and develops satellite-derived products.',
    criticality: 4,
    requirements: [
      ['SATELLITE', 90, 5],
      ['FORECASTING', 70, 3],
      ['ATMOSPHERIC', 70, 3],
      ['DATA', 70, 4],
      ['CLIMATE', 60, 2],
    ],
  },
  {
    code: 'CLS',
    name: 'Climate Scientist',
    description: 'Monitors climate variability and produces climate services and long-range outlooks.',
    criticality: 3,
    requirements: [
      ['CLIMATE', 90, 5],
      ['ATMOSPHERIC', 80, 4],
      ['DATA', 80, 4],
      ['NWP', 60, 2],
      ['FORECASTING', 55, 2],
    ],
  },
  {
    code: 'NWPS',
    name: 'NWP Scientist',
    description: 'Maintains operational models, data assimilation and forecast verification.',
    criticality: 4,
    requirements: [
      ['NWP', 90, 5],
      ['ATMOSPHERIC', 80, 4],
      ['DATA', 80, 4],
      ['FORECASTING', 65, 3],
    ],
  },
  {
    code: 'CWO',
    name: 'Cyclone Warning Officer',
    description: 'Tracks tropical cyclones and issues cyclone warnings in coordination with disaster managers.',
    criticality: 5,
    requirements: [
      ['DRM', 85, 5],
      ['FORECASTING', 80, 5],
      ['SATELLITE', 75, 4],
      ['RADAR', 75, 4],
      ['NWP', 60, 3],
    ],
  },
  {
    code: 'MDA',
    name: 'Meteorological Data Analyst',
    description: 'Builds data pipelines, analyses observations and produces decision-support products.',
    criticality: 3,
    requirements: [
      ['DATA', 90, 5],
      ['CLIMATE', 65, 3],
      ['ATMOSPHERIC', 60, 2],
    ],
  },
  {
    code: 'SST',
    name: 'Senior Scientist (Trainer)',
    description: 'Senior scientist who designs and delivers capacity-building programmes.',
    criticality: 3,
    requirements: [
      ['FORECASTING', 85, 4],
      ['ATMOSPHERIC', 80, 3],
      ['DATA', 65, 2],
    ],
  },
  {
    code: 'LDO',
    name: 'Learning & Development Officer',
    description: 'Runs capacity-building governance, analytics and learning strategy.',
    criticality: 2,
    requirements: [
      ['DATA', 60, 3],
      ['DRM', 50, 2],
    ],
  },
];

export type RoleCode = (typeof ROLES)[number]['code'];
