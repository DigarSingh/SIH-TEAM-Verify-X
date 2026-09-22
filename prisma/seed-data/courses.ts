import type { CompetencyCode } from './framework';

export type TrainerKey = 'arjun' | 'neha' | 'ishita' | 'rohan';

export interface ModuleSeed {
  title: string;
  description: string;
  minutes: number;
  /** Lecture notes shown as a TEXT material. */
  notes: string;
  link?: { title: string; url: string };
}

export interface CourseSeed {
  key: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  trainer: TrainerKey;
  passingScore: number;
  timeLimit: number;
  maxAttempts: number;
  outcomes: string[];
  /** Competency mappings: the course suits learners from `from` and can take them up to `to`. */
  competencies: { code: CompetencyCode; from: number; to: number }[];
  prerequisites: string[];
  modules: ModuleSeed[];
  status?: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  /** Draft/archived courses have no assessment. */
  assessment?: boolean;
}

const MET_ED = { title: 'COMET MetEd - free meteorology training', url: 'https://www.meted.ucar.edu/' };
const NOAA_RADAR = { title: 'NOAA JetStream - weather radar', url: 'https://www.noaa.gov/jetstream/radar' };
const WMO = { title: 'WMO - World Meteorological Organization', url: 'https://wmo.int/' };
const IMD = { title: 'India Meteorological Department', url: 'https://mausam.imd.gov.in/' };

export const COURSES: CourseSeed[] = [
  // ------------------------------------------------------------------ radar path
  {
    key: 'radar-fundamentals',
    title: 'Radar Fundamentals',
    description: 'Build a confident foundation in weather radar: how pulses are transmitted and received, what reflectivity means, why beams bend and broaden, and how to recognise non-meteorological echoes on IMD radar displays.',
    category: 'Radar Meteorology',
    difficulty: 'BEGINNER',
    trainer: 'arjun',
    passingScore: 70,
    timeLimit: 30,
    maxAttempts: 3,
    outcomes: ['Explain how a pulsed weather radar measures precipitation', 'Read base reflectivity in dBZ and estimate rain rates', 'Recognise clutter, anomalous propagation and second-trip echoes', 'Choose the right scan strategy for a forecasting task'],
    competencies: [{ code: 'RADAR', from: 0, to: 75 }],
    prerequisites: [],
    modules: [
      { title: 'How weather radar works', description: 'Pulse transmission, backscatter and the radar equation in words.', minutes: 40, notes: 'A weather radar transmits short pulses of microwave energy and listens for the energy scattered back by raindrops, ice and other targets. The time between transmission and reception gives range (r = c·t/2), and the received power gives reflectivity. Pulse repetition frequency sets the maximum unambiguous range: r_max = c / (2·PRF).', link: NOAA_RADAR },
      { title: 'Reflectivity and rainfall estimation', description: 'dBZ, the Z-R relationship and what echo intensity tells you.', minutes: 45, notes: 'Reflectivity factor Z is proportional to the sixth power of drop diameter, so a few large drops dominate the signal. It is expressed logarithmically in dBZ (dBZ = 10·log10 Z). Operational rainfall estimates use empirical Z-R relations such as Z = 200·R^1.6; the coefficients vary with drop-size distribution, so estimates must be checked against gauges.' },
      { title: 'Beam geometry, attenuation and clutter', description: 'Why the beam rises and spreads, and what contaminates the picture.', minutes: 50, notes: 'Earth curvature and normal refraction make the beam climb above the ground with range, so low-level features are missed at long distance. The beam also widens with range, smoothing small storms. Shorter wavelengths (X-band) are attenuated more strongly by heavy rain than S- or C-band. Ground clutter, sea clutter, birds, insects and anomalous propagation must be filtered or recognised.' },
      { title: 'Products and operational use', description: 'PPI, CAPPI, composites and using radar in a forecast briefing.', minutes: 45, notes: 'A PPI shows echoes at a constant elevation angle, whereas a CAPPI interpolates a constant altitude. Composite reflectivity shows the maximum value in the column. In operations, always cross-check radar against satellite and surface observations, note the radar quality flags, and state the time and product used when communicating a nowcast.', link: IMD },
      { title: 'Assessment readiness', description: 'Revision of key formulas and a worked case study.', minutes: 20, notes: 'Revise: r = c·t/2; r_max = c/(2·PRF); range resolution = c·τ/2; dBZ = 10·log10(Z); Z = 200·R^1.6. Work through one case: identify clutter, decide which echoes are meteorological, and estimate rain rate from a 40 dBZ echo.' },
    ],
  },
  {
    key: 'doppler-radar',
    title: 'Doppler Radar Analysis',
    description: 'Move from reflectivity to motion: interpret radial velocity, spectrum width and dual-polarisation products to diagnose convective organisation, wind shear and mesocyclones.',
    category: 'Radar Meteorology',
    difficulty: 'INTERMEDIATE',
    trainer: 'arjun',
    passingScore: 70,
    timeLimit: 25,
    maxAttempts: 3,
    outcomes: ['Interpret radial velocity patterns and identify rotation', 'Resolve velocity aliasing and range folding', 'Use dual-polarisation products to separate rain, hail and debris', 'Assess storm structure for short-term warnings'],
    competencies: [{ code: 'RADAR', from: 55, to: 88 }, { code: 'FORECASTING', from: 40, to: 65 }],
    prerequisites: ['radar-fundamentals'],
    modules: [
      { title: 'Radial velocity fundamentals', description: 'Reading inbound and outbound motion.', minutes: 45, notes: 'Doppler radar measures only the component of motion along the beam (radial velocity). By convention, inbound velocities are shown in cool colours and outbound in warm colours. A couplet of strong inbound and outbound velocities in close proximity indicates rotation or convergence, depending on orientation.' },
      { title: 'Aliasing and the Nyquist velocity', description: 'Unfolding ambiguous velocities.', minutes: 40, notes: 'The maximum unambiguous velocity (Nyquist velocity) is λ·PRF/4. Velocities beyond it fold back into the opposite sign. Dual-PRF techniques and dealiasing algorithms extend the range, but operators must still recognise folded data. There is a fundamental trade-off between unambiguous range and unambiguous velocity.' },
      { title: 'Dual-polarisation products', description: 'ZDR, CC and KDP in operations.', minutes: 50, notes: 'Differential reflectivity (ZDR) indicates drop shape: large positive values suggest big oblate raindrops, near zero suggests hail or tumbling ice. Correlation coefficient (CC) is high (>0.97) for uniform rain and drops sharply in mixed targets such as tornado debris or the melting layer. Specific differential phase (KDP) is proportional to rain rate and immune to attenuation.' },
      { title: 'Storm structure and warning decisions', description: 'From signatures to actionable warnings.', minutes: 55, notes: 'Combine reflectivity structure (hook echo, bounded weak echo region), velocity signatures and dual-pol debris signals to assess severe-storm potential. Trends matter more than a single volume scan. Document what you saw, your confidence and the lead time in the warning log so that the next shift can build on it.', link: MET_ED },
    ],
  },
  {
    key: 'advanced-radar',
    title: 'Advanced Radar Analysis & Nowcasting',
    description: 'Advanced radar applications: multi-radar mosaics, quantitative precipitation estimation, storm tracking and probabilistic nowcasting for high-impact events.',
    category: 'Radar Meteorology',
    difficulty: 'ADVANCED',
    trainer: 'arjun',
    passingScore: 75,
    timeLimit: 30,
    maxAttempts: 2,
    outcomes: ['Blend radar and gauge data for quantitative precipitation estimates', 'Track and extrapolate storms for 0-3 hour nowcasts', 'Verify nowcasts with object-based and neighbourhood scores'],
    competencies: [{ code: 'RADAR', from: 75, to: 96 }, { code: 'FORECASTING', from: 60, to: 80 }],
    prerequisites: ['doppler-radar'],
    modules: [
      { title: 'Radar quality control and mosaicking', description: 'Merging a network into one trustworthy picture.', minutes: 50, notes: 'A national mosaic depends on consistent calibration, clutter suppression and beam-blockage correction. Overlap regions must be blended using distance and quality weights so that a noisy far-range pixel does not override a clean near-range one.' },
      { title: 'Quantitative precipitation estimation', description: 'Radar-gauge merging and hydrological use.', minutes: 55, notes: 'Radar estimates are adjusted with gauge networks using mean-field bias correction or spatial merging techniques. Dual-polarisation estimators (R(KDP), R(Z, ZDR)) reduce sensitivity to drop-size variability and hail contamination. Always report an uncertainty range for flash-flood guidance.' },
      { title: 'Storm tracking and nowcasting', description: 'Extrapolation, growth and decay.', minutes: 60, notes: 'Optical-flow and cell-tracking methods extrapolate motion, but convective initiation and decay limit skill beyond about two hours. Blend extrapolation with NWP as lead time increases, and communicate nowcasts as probabilities of exceeding impact-relevant thresholds.', link: WMO },
      { title: 'Verification and continuous improvement', description: 'Measuring what works.', minutes: 40, notes: 'Use categorical scores (POD, FAR, CSI) with neighbourhood or object-based methods so that small displacement errors are not double-penalised. Keep a case library of well-handled and poorly handled events and review it quarterly.' },
    ],
  },

  // ------------------------------------------------------------------ forecasting
  {
    key: 'forecasting-fundamentals',
    title: 'Weather Forecasting Fundamentals',
    description: 'A practical grounding in synoptic reasoning, observation networks, forecast preparation and clear communication of weather information.',
    category: 'Forecasting',
    difficulty: 'BEGINNER',
    trainer: 'neha',
    passingScore: 70,
    timeLimit: 30,
    maxAttempts: 3,
    outcomes: ['Analyse a synoptic chart and describe the weather situation', 'Combine observations into a district-level forecast', 'Communicate uncertainty in plain language'],
    competencies: [{ code: 'FORECASTING', from: 0, to: 70 }, { code: 'ATMOSPHERIC', from: 0, to: 50 }],
    prerequisites: [],
    modules: [
      { title: 'Observation networks and data quality', description: 'Surface, upper-air, radar and satellite observations.', minutes: 40, notes: 'Forecasts start with observations. Understand what each network measures, how often, with what latency and what quality-control flags to check. A single erroneous station can distort a hand analysis, so learn to spot outliers by comparing with neighbours.', link: IMD },
      { title: 'Synoptic analysis', description: 'Pressure systems, fronts, troughs and monsoon features.', minutes: 50, notes: 'Analyse mean sea-level pressure, 850/500/200 hPa charts and identify systems: monsoon trough, low-pressure areas, western disturbances, cyclonic circulations and jet streams. Relate each feature to the weather it typically brings.' },
      { title: 'Preparing the forecast', description: 'From analysis to a district forecast.', minutes: 55, notes: 'Follow a consistent process: analyse, diagnose, prognosticate, then communicate. Start from the current state, evaluate model guidance against the observed evolution, adjust for known biases, and finish with the impact you expect rather than just the meteorology.' },
      { title: 'Communicating forecasts and uncertainty', description: 'Words, numbers and colours that people understand.', minutes: 40, notes: 'Use impact-oriented language, consistent terminology and the IMD colour-coded warning scheme. Express uncertainty with probabilities or ranges and explain what would change the forecast. Avoid jargon in public products.' },
    ],
  },
  {
    key: 'advanced-forecasting',
    title: 'Advanced Weather Forecasting',
    description: 'Scenario-led forecasting for high-impact weather: multi-model reasoning, probabilistic products and decision-focused briefings.',
    category: 'Forecasting',
    difficulty: 'ADVANCED',
    trainer: 'neha',
    passingScore: 75,
    timeLimit: 30,
    maxAttempts: 2,
    outcomes: ['Integrate deterministic and ensemble guidance', 'Prioritise forecast risks by impact and likelihood', 'Deliver an early-action briefing to decision makers'],
    competencies: [{ code: 'FORECASTING', from: 65, to: 95 }, { code: 'DRM', from: 40, to: 70 }],
    prerequisites: ['forecasting-fundamentals'],
    modules: [
      { title: 'Model interpretation and forecaster value-add', description: 'Where humans still beat models.', minutes: 50, notes: 'Learn systematic model biases for your region (e.g. monsoon rainfall timing, orographic enhancement) and how to correct for them. Forecaster value-add is greatest in the first 12-24 hours and in rapidly evolving situations.' },
      { title: 'High-impact weather scenarios', description: 'Heavy rain, heatwaves, cold waves, thunderstorms.', minutes: 60, notes: 'Work case studies for each hazard: assemble the ingredients, identify triggers and decide lead time. For heavy rain, consider moisture supply, orography, propagation and training of cells; for heatwaves, consider persistence, humidity and night-time minima.' },
      { title: 'Probabilistic thinking', description: 'Using ensembles to describe risk.', minutes: 45, notes: 'Ensemble spread indicates predictability, not truth. Use probability-of-exceedance maps for impact thresholds, and explain to users that a 30% chance of extreme rainfall can still justify precautionary action if the consequence is severe.' },
      { title: 'Decision briefings', description: 'Turning a forecast into action.', minutes: 45, notes: 'Structure briefings as: what is expected, where and when, how confident, and what actions are recommended. Rehearse concise messages for the media, state disaster-management authorities and district magistrates.' },
    ],
  },
  {
    key: 'nwp-essentials',
    title: 'Numerical Weather Prediction Essentials',
    description: 'Understand how operational NWP works - model equations, parameterisation, data assimilation and products - and how to use guidance critically.',
    category: 'Modelling & Prediction',
    difficulty: 'INTERMEDIATE',
    trainer: 'neha',
    passingScore: 70,
    timeLimit: 25,
    maxAttempts: 3,
    outcomes: ['Describe the main components of an NWP system', 'Compare global and regional model guidance', 'Identify typical model errors and their causes'],
    competencies: [{ code: 'NWP', from: 0, to: 75 }, { code: 'FORECASTING', from: 50, to: 75 }],
    prerequisites: [],
    modules: [
      { title: 'The equations and grids', description: 'What a model actually solves.', minutes: 45, notes: 'NWP integrates the primitive equations (momentum, thermodynamic energy, continuity, moisture) on a grid or spectral representation. Resolution determines which processes are resolved explicitly; the rest must be parameterised.' },
      { title: 'Parameterisation of sub-grid processes', description: 'Convection, radiation, boundary layer.', minutes: 50, notes: 'Cumulus convection, cloud microphysics, radiation and turbulence occur below grid scale. Their parameterisations are the largest source of systematic error, especially for monsoon rainfall. Convection-permitting models (about 3 km) reduce, but do not remove, this problem.' },
      { title: 'Data assimilation', description: 'Combining observations with a short forecast.', minutes: 50, notes: 'Assimilation blends a background forecast with observations weighted by their error statistics to produce an analysis. Variational (3D-Var/4D-Var) and ensemble Kalman filter methods are used operationally. Observation quality control and bias correction are as important as the algorithm.' },
      { title: 'Using and verifying guidance', description: 'Bias, skill and post-processing.', minutes: 45, notes: 'Compare forecasts with observations using bias, RMSE and anomaly correlation. Statistical post-processing and model output statistics correct systematic errors. Always know the model cycle time and the data cut-off before relying on a run.', link: { title: 'ECMWF', url: 'https://www.ecmwf.int/' } },
    ],
  },
  {
    key: 'ensemble-verification',
    title: 'Ensemble Prediction & Forecast Verification',
    description: 'Advanced use of ensemble systems and rigorous forecast verification for operational decision-making.',
    category: 'Modelling & Prediction',
    difficulty: 'ADVANCED',
    trainer: 'neha',
    passingScore: 75,
    timeLimit: 25,
    maxAttempts: 2,
    outcomes: ['Interpret ensemble spread and reliability', 'Apply probabilistic verification scores', 'Design a verification framework for a regional model'],
    competencies: [{ code: 'NWP', from: 70, to: 95 }],
    prerequisites: ['nwp-essentials'],
    modules: [
      { title: 'Ensemble design', description: 'Perturbing initial conditions and models.', minutes: 45, notes: 'Ensembles sample uncertainty in initial conditions (singular vectors, ensemble data assimilation) and in the model itself (stochastic physics, multi-physics). Under-dispersive ensembles give overconfident forecasts.' },
      { title: 'Probabilistic verification', description: 'Reliability, resolution and the Brier score.', minutes: 50, notes: 'A reliable ensemble produces probabilities that match observed frequencies. The Brier score decomposes into reliability, resolution and uncertainty. The CRPS generalises to continuous variables. Use reliability diagrams and ROC curves to communicate skill.' },
      { title: 'Post-processing and calibration', description: 'Turning raw ensembles into useful products.', minutes: 45, notes: 'Calibrate ensembles with ensemble model output statistics or quantile mapping using a sufficiently long training archive. Beware of changing model versions that invalidate the training data.' },
    ],
  },

  // ------------------------------------------------------------------ satellite
  {
    key: 'satellite-meteorology',
    title: 'Satellite Meteorology',
    description: 'Interpret multi-spectral satellite imagery for cloud analysis, rainfall monitoring and rapid situational awareness over the Indian region.',
    category: 'Satellite Services',
    difficulty: 'INTERMEDIATE',
    trainer: 'rohan',
    passingScore: 70,
    timeLimit: 30,
    maxAttempts: 3,
    outcomes: ['Choose the right spectral channel for a task', 'Identify cloud types and stages of convective development', 'Combine satellite and radar evidence'],
    competencies: [{ code: 'SATELLITE', from: 0, to: 80 }, { code: 'FORECASTING', from: 45, to: 70 }],
    prerequisites: [],
    modules: [
      { title: 'Sensors and spectral channels', description: 'Visible, infrared and water-vapour imagery.', minutes: 45, notes: 'Visible imagery shows reflected sunlight (daytime only). Infrared (10.8 micrometres) senses cloud-top temperature, so colder tops mean higher clouds. Water-vapour channels show upper-tropospheric moisture and dynamics such as jets and troughs.', link: { title: 'EUMETSAT user portal', url: 'https://user.eumetsat.int/' } },
      { title: 'Cloud identification', description: 'Distinguishing cloud types.', minutes: 50, notes: 'Combine brightness, texture and temperature to identify cumulonimbus, stratus, cirrus and fog. Compare the visible and IR images: bright and cold indicates deep convection; bright and warm indicates low cloud or fog.' },
      { title: 'Rainfall and convection monitoring', description: 'Estimating rain from cloud-top properties.', minutes: 50, notes: 'Satellite rainfall estimates relate cold cloud-top area and growth rate to precipitation. Rapid cooling of cloud tops is an early indicator of intensifying convection. Blend with rain-gauge and radar data for quantitative work.' },
      { title: 'Operational products', description: 'Derived products used at IMD.', minutes: 40, notes: 'Learn the standard derived products: cloud-motion winds, sea-surface temperature, outgoing longwave radiation, fog and dust detection, and cyclone intensity estimates. Always check the product time stamp and validity.' },
    ],
  },
  {
    key: 'advanced-satellite',
    title: 'Advanced Satellite Applications',
    description: 'Quantitative satellite applications: retrievals, tropical cyclone intensity estimation and severe-weather nowcasting from geostationary data.',
    category: 'Satellite Services',
    difficulty: 'ADVANCED',
    trainer: 'rohan',
    passingScore: 75,
    timeLimit: 25,
    maxAttempts: 2,
    outcomes: ['Apply the Dvorak technique to estimate cyclone intensity', 'Use RGB composites for hazard detection', 'Assess retrieval uncertainty'],
    competencies: [{ code: 'SATELLITE', from: 75, to: 95 }],
    prerequisites: ['satellite-meteorology'],
    modules: [
      { title: 'RGB composites', description: 'Day microphysics, night microphysics and dust.', minutes: 45, notes: 'RGB composites combine channels so that specific hazards stand out in colour: fog and low cloud, dust, ash and convective-storm microphysics. Learn the recipes, the colour interpretation and the limitations at high viewing angles.' },
      { title: 'Tropical cyclone intensity estimation', description: 'The Dvorak technique.', minutes: 55, notes: 'The Dvorak technique estimates intensity from cloud patterns (curved band, central dense overcast, eye) to derive a T-number and a maximum sustained wind. Constraints on the rate of intensity change stabilise the estimate. Compare with microwave imagery, scatterometer winds and aircraft or buoy reports where available.' },
      { title: 'Retrievals and uncertainty', description: 'Error characterisation.', minutes: 40, notes: 'Every retrieval carries uncertainty from calibration, algorithm assumptions and viewing geometry. Validate against independent observations and communicate confidence with the product.' },
    ],
  },

  // ------------------------------------------------------------------ atmospheric science
  {
    key: 'atmospheric-dynamics',
    title: 'Atmospheric Dynamics',
    description: 'The physics behind the weather: thermodynamics, stability, geostrophic balance, vorticity and the quasi-geostrophic framework applied to real Indian cases.',
    category: 'Scientific Foundations',
    difficulty: 'INTERMEDIATE',
    trainer: 'ishita',
    passingScore: 70,
    timeLimit: 30,
    maxAttempts: 3,
    outcomes: ['Use thermodynamic diagrams to assess stability', 'Explain geostrophic and thermal wind balance', 'Diagnose vertical motion using QG reasoning'],
    competencies: [{ code: 'ATMOSPHERIC', from: 30, to: 85 }],
    prerequisites: [],
    modules: [
      { title: 'Atmospheric thermodynamics', description: 'Stability and moist processes.', minutes: 50, notes: 'The dry adiabatic lapse rate is about 9.8 K/km; the saturated rate is smaller because of latent heating. An environment cooling faster than the parcel is unstable. CAPE integrates the buoyancy of a lifted parcel and indicates the potential strength of updrafts.' },
      { title: 'Balance and the wind', description: 'Geostrophic, gradient and thermal wind.', minutes: 50, notes: 'Away from the equator, the pressure-gradient force is approximately balanced by the Coriolis force, giving geostrophic wind parallel to isobars. The vertical shear of the geostrophic wind is proportional to the horizontal temperature gradient (thermal wind).' },
      { title: 'Vorticity and vertical motion', description: 'The quasi-geostrophic view.', minutes: 55, notes: 'Positive vorticity advection increasing with height, and warm-air advection, are associated with QG forcing for ascent. Use the omega equation qualitatively to decide where large-scale lift is likely, then add mesoscale ingredients.' },
      { title: 'Monsoon and tropical circulations', description: 'Regional dynamics.', minutes: 45, notes: 'The Indian summer monsoon is driven by land-sea thermal contrast and the migration of the ITCZ. Intraseasonal oscillations (active and break spells), the monsoon trough and low-pressure systems from the Bay of Bengal modulate rainfall.', link: MET_ED },
    ],
  },

  // ------------------------------------------------------------------ data and climate
  {
    key: 'python-met-data',
    title: 'Python for Meteorological Data',
    description: 'Reproducible Python workflows for cleaning, analysing and visualising meteorological datasets with NumPy, pandas and xarray.',
    category: 'Data & Digital',
    difficulty: 'BEGINNER',
    trainer: 'ishita',
    passingScore: 70,
    timeLimit: 25,
    maxAttempts: 3,
    outcomes: ['Load common weather data formats (CSV, NetCDF, GRIB)', 'Clean and summarise time series', 'Produce clear analytical plots', 'Build a repeatable analysis notebook'],
    competencies: [{ code: 'DATA', from: 0, to: 75 }],
    prerequisites: [],
    modules: [
      { title: 'Python environment and notebooks', description: 'Setting up for reproducible work.', minutes: 35, notes: 'Use an isolated environment, pin your package versions and keep notebooks tidy: one purpose per notebook, inputs at the top, results at the bottom. Store raw data read-only and write derived data to a separate folder.' },
      { title: 'Working with time series', description: 'pandas essentials.', minutes: 50, notes: 'A DatetimeIndex makes resampling, rolling statistics and seasonal grouping straightforward. Handle missing values explicitly (interpolate, flag or drop) and document the choice. Never silently fill gaps.' },
      { title: 'Gridded data with xarray', description: 'NetCDF and labelled arrays.', minutes: 55, notes: 'xarray provides labelled multi-dimensional arrays with coordinates, ideal for NetCDF and GRIB model or reanalysis data. Select by label, compute climatologies with groupby and anomalies by subtraction.', link: { title: 'xarray documentation', url: 'https://docs.xarray.dev/' } },
      { title: 'Visualisation', description: 'Clear, honest plots.', minutes: 40, notes: 'Choose the plot type for the question, label axes with units, use colour-blind-safe palettes and always show the data period. For maps use a suitable projection and coastlines.', link: { title: 'Matplotlib', url: 'https://matplotlib.org/' } },
    ],
  },
  {
    key: 'climate-data-analysis',
    title: 'Climate Data Analysis',
    description: 'Turn climate observations into defensible insights using anomalies, trends, indices and reproducible methods.',
    category: 'Climate & Research',
    difficulty: 'INTERMEDIATE',
    trainer: 'ishita',
    passingScore: 70,
    timeLimit: 25,
    maxAttempts: 3,
    outcomes: ['Compute climatologies and anomalies against a baseline', 'Test and describe trends with uncertainty', 'Communicate climate results responsibly'],
    competencies: [{ code: 'CLIMATE', from: 0, to: 75 }, { code: 'DATA', from: 40, to: 70 }],
    prerequisites: [],
    modules: [
      { title: 'Climatologies and anomalies', description: 'Choosing baselines.', minutes: 45, notes: 'A climatology is the average over a reference period (WMO uses 30 years, currently 1991-2020). An anomaly is the departure from that mean. Report the baseline explicitly because anomalies change with the reference period.', link: WMO },
      { title: 'Trend analysis', description: 'Linear trends and their uncertainty.', minutes: 50, notes: 'Use robust methods such as the Theil-Sen slope with the Mann-Kendall test for non-normal data. Always quote a confidence interval and be careful about autocorrelation, which inflates apparent significance.' },
      { title: 'Extremes and indices', description: 'ETCCDI indices.', minutes: 45, notes: 'Extreme indices such as consecutive dry days, heavy-precipitation days and warm nights describe changes in tails, which often matter more than changes in the mean. Compute them from daily data with consistent quality control.' },
      { title: 'Communicating climate information', description: 'Plain language and honest uncertainty.', minutes: 35, notes: 'Distinguish weather variability from climate change, avoid single-event attribution unless supported by attribution studies, and state limitations of the data (station density, homogenisation).', link: { title: 'IPCC', url: 'https://www.ipcc.ch/' } },
    ],
  },
  {
    key: 'data-visualisation',
    title: 'Data Visualisation for Decision Support',
    description: 'Create clear, evidence-led dashboards and stories for internal reviews and operational briefings.',
    category: 'Data & Digital',
    difficulty: 'INTERMEDIATE',
    trainer: 'ishita',
    passingScore: 70,
    timeLimit: 20,
    maxAttempts: 3,
    outcomes: ['Choose the right chart for a question', 'Design an accessible dashboard', 'Explain evidence to decision makers'],
    competencies: [{ code: 'DATA', from: 60, to: 90 }],
    prerequisites: ['python-met-data'],
    modules: [
      { title: 'Visual grammar', description: 'Marks, channels and encoding.', minutes: 35, notes: 'Position and length encode quantities most accurately; colour hue is best for categories, and lightness for ordered values. Avoid 3D effects and truncated bar-chart axes.' },
      { title: 'Chart selection', description: 'Matching charts to questions.', minutes: 40, notes: 'Use lines for change over time, bars for comparison, scatter plots for relationships and heatmaps for two categorical dimensions plus a value. Sort categories meaningfully and annotate the key message.' },
      { title: 'Dashboard layout and accessibility', description: 'Designing for real users.', minutes: 45, notes: 'Lead with the most important numbers, group related items and keep interactions predictable. Ensure sufficient contrast, do not rely on colour alone and provide text alternatives.' },
    ],
  },

  // ------------------------------------------------------------------ disaster risk
  {
    key: 'disaster-risk-management',
    title: 'Disaster Risk Management & Impact-Based Forecasting',
    description: 'Strengthen the bridge between hazard forecasts, impact-based warnings and community action, in coordination with disaster-management authorities.',
    category: 'Public Safety',
    difficulty: 'INTERMEDIATE',
    trainer: 'rohan',
    passingScore: 70,
    timeLimit: 25,
    maxAttempts: 3,
    outcomes: ['Frame forecasts as impacts and recommended actions', 'Apply the risk matrix used in colour-coded warnings', 'Coordinate messages across agencies'],
    competencies: [{ code: 'DRM', from: 0, to: 85 }, { code: 'FORECASTING', from: 55, to: 75 }],
    prerequisites: [],
    modules: [
      { title: 'Risk concepts', description: 'Hazard, exposure and vulnerability.', minutes: 40, notes: 'Risk arises from the combination of a hazard, the exposure of people and assets, and their vulnerability. The same rainfall amount can be harmless in one place and catastrophic in another, which is why impact information matters.' },
      { title: 'Impact-based forecasting', description: 'From what the weather will be to what it will do.', minutes: 50, notes: 'Impact-based forecasts combine hazard likelihood with impact severity in a warning matrix. Build impact tables with local partners so that thresholds reflect real consequences such as waterlogging, crop damage or transport disruption.', link: WMO },
      { title: 'Warning protocols and dissemination', description: 'Getting messages to people in time.', minutes: 45, notes: 'Effective warnings are timely, specific, consistent across agencies and delivered through channels people use. Follow the Common Alerting Protocol where available and always include the recommended actions.' },
      { title: 'Scenario exercise', description: 'A tabletop drill.', minutes: 50, notes: 'Work through a cyclone-landfall scenario: agree on hazard forecasts, expected impacts by district, evacuation triggers and communication roles. Capture lessons in a short after-action review.' },
    ],
  },
  {
    key: 'cyclone-warning',
    title: 'Cyclone Monitoring & Warning',
    description: 'Operational tropical cyclone tracking, intensity estimation and warning practice for the North Indian Ocean basin.',
    category: 'Public Safety',
    difficulty: 'ADVANCED',
    trainer: 'rohan',
    passingScore: 75,
    timeLimit: 30,
    maxAttempts: 2,
    outcomes: ['Combine satellite, radar and model guidance for track and intensity', 'Issue cyclone bulletins with the correct terminology', 'Coordinate landfall messaging with state authorities'],
    competencies: [{ code: 'DRM', from: 50, to: 90 }, { code: 'SATELLITE', from: 50, to: 80 }],
    prerequisites: ['disaster-risk-management'],
    modules: [
      { title: 'Genesis and structure', description: 'How cyclones form and organise.', minutes: 45, notes: 'Tropical cyclones need warm sea-surface temperatures (about 26.5 degrees C or more), low vertical wind shear, sufficient Coriolis force and pre-existing low-level vorticity. Understand the eye, eyewall and rain bands and how they appear on satellite and radar.', link: { title: 'National Hurricane Center', url: 'https://www.nhc.noaa.gov/' } },
      { title: 'Track and intensity guidance', description: 'Models, ensembles and consensus.', minutes: 55, notes: 'Track forecasts are more skilful than intensity forecasts. Use multi-model consensus and ensemble tracks to draw the cone of uncertainty. Rapid intensification remains difficult; monitor ocean heat content and shear closely.' },
      { title: 'Bulletins and terminology', description: 'Communicating clearly.', minutes: 40, notes: 'IMD classifies systems from depression through deep depression, cyclonic storm, severe cyclonic storm, very severe, extremely severe and super cyclonic storm. Use the official classification, expected landfall point and time window, and hazards: wind, storm surge and rainfall.' },
      { title: 'Landfall coordination', description: 'Working with state agencies.', minutes: 45, notes: 'Provide frequent, consistent updates to state disaster-management authorities, with district-level impact expectations and recommended evacuation timing. Keep a single source of truth for the latest advisory.' },
    ],
  },

  // ------------------------------------------------------------------ non-published examples
  {
    key: 'marine-meteorology-draft',
    title: 'Marine Meteorology (in preparation)',
    description: 'Forecasting for coastal and ocean areas: sea state, swell, marine hazards and services for fishermen and shipping. Course under development.',
    category: 'Forecasting',
    difficulty: 'INTERMEDIATE',
    trainer: 'neha',
    passingScore: 70,
    timeLimit: 30,
    maxAttempts: 3,
    outcomes: ['Interpret wave and swell forecasts', 'Prepare marine warnings for fishermen'],
    competencies: [{ code: 'FORECASTING', from: 40, to: 75 }],
    prerequisites: [],
    status: 'DRAFT',
    assessment: false,
    modules: [{ title: 'Ocean waves and swell', description: 'Wave generation and propagation.', minutes: 45, notes: 'Waves are generated by wind and characterised by significant wave height, period and direction. Swell is long-period wave energy that has travelled beyond its generating area.' }],
  },
  {
    key: 'legacy-observing-practices',
    title: 'Legacy Surface Observing Practices',
    description: 'Retired course on manual observing practice, kept for records.',
    category: 'Forecasting',
    difficulty: 'BEGINNER',
    trainer: 'neha',
    passingScore: 70,
    timeLimit: 20,
    maxAttempts: 3,
    outcomes: ['Understand historical observing conventions'],
    competencies: [{ code: 'FORECASTING', from: 0, to: 30 }],
    prerequisites: [],
    status: 'ARCHIVED',
    assessment: false,
    modules: [{ title: 'Manual observing', description: 'Historical practice.', minutes: 30, notes: 'Historical manual observing practices, replaced by automatic weather stations in most locations.' }],
  },
];

export const TRAINER_PROFILES: Record<TrainerKey, { name: string; email: string; department: string; designation: string; location: string; employeeId: string; expertise: string[]; bio: string }> = {
  arjun: {
    name: 'Dr. Arjun Mehta',
    email: 'trainer@imd.gov.in',
    department: 'RD',
    designation: 'Senior Scientist',
    location: 'Pune',
    employeeId: 'IMD-FC-0482',
    expertise: ['Radar Meteorology', 'Doppler Radar', 'Nowcasting'],
    bio: 'Leads radar interpretation and severe-weather nowcasting training across IMD regional centres.',
  },
  neha: {
    name: 'Dr. Neha Kapoor',
    email: 'neha.kapoor@imd.gov.in',
    department: 'FC',
    designation: 'Scientist E',
    location: 'New Delhi',
    employeeId: 'IMD-FC-0511',
    expertise: ['Weather Forecasting', 'Numerical Weather Prediction', 'Ensemble Forecasting'],
    bio: 'Operational forecaster and NWP specialist who designs scenario-based forecaster training.',
  },
  ishita: {
    name: 'Dr. Ishita Bose',
    email: 'ishita.bose@imd.gov.in',
    department: 'CLR',
    designation: 'Scientist D',
    location: 'Kolkata',
    employeeId: 'IMD-FC-0538',
    expertise: ['Climate Analysis', 'Data Science', 'Atmospheric Dynamics'],
    bio: 'Climate scientist teaching reproducible data analysis and atmospheric dynamics.',
  },
  rohan: {
    name: 'Dr. Rohan Deshmukh',
    email: 'rohan.deshmukh@imd.gov.in',
    department: 'CDW',
    designation: 'Scientist E',
    location: 'Bhubaneswar',
    employeeId: 'IMD-FC-0561',
    expertise: ['Satellite Meteorology', 'Tropical Cyclones', 'Impact-Based Forecasting'],
    bio: 'Cyclone warning specialist focused on satellite applications and impact-based forecasting.',
  },
};
