export interface QuestionSeed {
  text: string;
  /** Correct answers first, then distractors. The seeder rotates positions so the key is not a pattern. */
  correct: string[];
  wrong: string[];
  marks: number;
  explanation: string;
  type: 'SINGLE' | 'MULTIPLE';
}

const q = (text: string, correct: string, wrong: [string, string, string], explanation: string, marks = 1): QuestionSeed => ({
  text,
  correct: [correct],
  wrong,
  marks,
  explanation,
  type: 'SINGLE',
});

const multi = (text: string, correct: [string, string], wrong: [string, string], explanation: string, marks = 2): QuestionSeed => ({
  text,
  correct,
  wrong,
  marks,
  explanation,
  type: 'MULTIPLE',
});

/**
 * Assessment question banks, keyed by course. Radar Fundamentals has 20 questions
 * worth 25 marks in total (15 x 1 + 5 x 2): answering 21 marks correctly scores exactly 84%.
 */
export const QUESTION_BANKS: Record<string, QuestionSeed[]> = {
  'radar-fundamentals': [
    q('What does a weather radar transmit and receive?', 'Pulses of microwave energy and the energy scattered back by precipitation particles', ['Continuous infrared light reflected by clouds', 'Ultrasonic sound waves', 'Visible light emitted by lightning'], 'Weather radar sends short microwave pulses and measures the backscattered energy.'),
    q('In which unit is radar reflectivity conventionally expressed?', 'dBZ', ['mm per hour', 'metres per second', 'hectopascals'], 'Reflectivity factor Z is expressed logarithmically as dBZ.'),
    q('A reflectivity of about 20 dBZ typically indicates:', 'Very light precipitation or drizzle', ['Large damaging hail', 'Tornado debris', 'A completely clear atmosphere'], 'About 20 dBZ corresponds to very light rain or drizzle; hail is usually above 55-60 dBZ.'),
    q('Which pair of radar bands is widely used by operational weather radars, with S-band favoured where heavy rain would attenuate the signal?', 'S-band and C-band', ['Ku-band and Ka-band', 'L-band and P-band', 'HF and VHF'], 'S-band and C-band are the workhorses of operational weather radar networks.'),
    q('Why is attenuation by heavy rain a larger problem at X-band than at S-band?', 'Shorter wavelengths are absorbed and scattered more strongly by raindrops', ['X-band antennas are physically larger', 'S-band signals reflect off the ionosphere', 'X-band radars transmit at lower frequency'], 'Attenuation increases as wavelength decreases.'),
    q('The maximum unambiguous range of a pulsed radar is set mainly by:', 'The pulse repetition frequency', ['The antenna height', 'The colour scale of the display', 'The transmitter cooling system'], 'r_max = c / (2 x PRF): a higher PRF means a shorter unambiguous range.'),
    q('As the radar beam travels farther from the radar, it:', 'Widens and samples a larger volume, and may overshoot low-level features', ['Becomes narrower and more accurate', 'Bends steadily towards the ground', 'Stops transmitting energy'], 'Beam broadening and Earth curvature limit low-level coverage at long range.'),
    q('The most common cause of ground clutter is:', 'The radar beam intercepting terrain and buildings', ['Heavy rainfall aloft', 'Lightning discharges', 'Solar heating of the antenna'], 'Fixed obstacles reflect energy back to the radar at low elevation angles.'),
    q('Anomalous propagation (AP) echoes occur when:', 'Strong temperature or humidity gradients bend the beam towards the ground', ['The transmitter power is too low', 'The radar is pointed at the sun', 'Rain is falling at the radar site'], 'Super-refraction bends the beam down so it strikes the surface, producing false echoes.'),
    q('A bright band on a vertical radar cross-section is associated with:', 'Melting snow and ice particles near the 0 degree Celsius level', ['A tornado vortex', 'Ground clutter', 'Sun interference'], 'Melting particles are coated in water, which greatly increases their reflectivity.'),
    q('A PPI display shows:', 'Echoes on a plan view at a constant elevation angle', ['A vertical slice through the storm', 'Only the wind profile', 'Only accumulated rainfall'], 'PPI = Plan Position Indicator.'),
    q('CAPPI stands for:', 'Constant Altitude Plan Position Indicator', ['Calibrated Antenna Power Pulse Index', 'Convective Area Precipitation Probability Indicator', 'Continuous Azimuth Phase Processing Index'], 'A CAPPI displays reflectivity interpolated to a constant altitude.'),
    q('Radar reflectivity is proportional to which power of the drop diameter?', 'The sixth power', ['The first power', 'The square root', 'It does not depend on diameter'], 'In Rayleigh scattering, Z is proportional to the sum of D^6, so large drops dominate.'),
    q('Which of the following is a NON-meteorological radar echo?', 'Birds and insects', ['Rain', 'Hail', 'Snow'], 'Birds and insects are biological scatterers that can be mistaken for weak precipitation.'),
    q('Range folding (second-trip echoes) occurs when:', 'Echoes from targets beyond the unambiguous range appear at a false, nearer range', ['Two radars overlap in coverage', 'The antenna stops rotating', 'Rain completely blocks the beam'], 'Echoes from a previous pulse are attributed to the current pulse.'),
    q('A radar operating at a PRF of 1000 Hz has a maximum unambiguous range of about:', '150 km', ['300 km', '75 km', '15 km'], 'r_max = c / (2 x PRF) = 3e8 / 2000 = 150 km.', 2),
    q('Using Z = 200 R^1.6, the rain rate for a 40 dBZ echo is approximately:', '11.5 mm per hour', ['1.2 mm per hour', '115 mm per hour', '4 mm per hour'], '40 dBZ means Z = 10,000; R = (10,000/200)^(1/1.6) = 50^0.625, about 11.5 mm/h.', 2),
    q('Why does a fixed low-elevation scan miss low-level rain at long range?', 'Earth curvature makes the beam rise above the ground with distance', ['Rain becomes invisible beyond 100 km', 'Antenna power falls to zero at long range', 'Clutter filters remove all echoes'], 'The beam height increases with range because the Earth curves away beneath it.', 2),
    q('Lengthening the transmitted pulse at the same peak power will mainly:', 'Increase sensitivity but worsen range resolution', ['Improve range resolution', 'Reduce the unambiguous range to zero', 'Switch off Doppler processing'], 'Range resolution is c x tau / 2, so longer pulses blur range detail but deliver more energy.', 2),
    q('Two storms lie 3 km apart along the same radial and the pulse length is 2 microseconds. Can the radar resolve them?', 'Yes - the range resolution is about 300 m', ['No - the resolution is about 3 km', 'No - the resolution is about 30 km', 'Only at night'], 'Range resolution = c x tau / 2 = 3e8 x 2e-6 / 2 = 300 m.', 2),
  ],

  'doppler-radar': [
    q('Doppler radar radial velocity measures:', 'The component of target motion along the radar beam', ['The total wind speed', 'Only the wind direction', 'The rainfall rate'], 'Only motion towards or away from the radar is detected.'),
    q('The Nyquist (maximum unambiguous) velocity is given by:', 'Wavelength x PRF / 4', ['c / (2 x PRF)', 'Wavelength / PRF', 'PRF / wavelength'], 'V_max = lambda x PRF / 4.'),
    q('Velocity aliasing (folding) happens when:', 'The true radial velocity exceeds the Nyquist velocity', ['The radar is switched off', 'Rain attenuates the signal', 'The antenna rotates too slowly'], 'Velocities beyond the Nyquist limit wrap around to the opposite sign.'),
    q('A tight inbound-outbound velocity couplet within a storm suggests:', 'Rotation', ['Ground clutter', 'A calibration error', 'Hail-free conditions'], 'Adjacent strong inbound and outbound velocities imply a rotating circulation.'),
    q('Large positive differential reflectivity (ZDR) at low levels usually indicates:', 'Large oblate raindrops', ['Tumbling hail', 'Ground clutter', 'Snow'], 'Large raindrops flatten as they fall, giving a larger horizontal than vertical return.'),
    q('A localised drop in correlation coefficient inside a hook echo with high reflectivity suggests:', 'Debris or mixed hydrometeors such as a tornado debris signature', ['Uniform light rain', 'Calm air', 'A perfectly calibrated radar'], 'Non-uniform, irregular targets decorrelate the polarised returns.'),
    q('Specific differential phase (KDP) is valuable for rainfall estimation because it is:', 'Proportional to rain rate and unaffected by attenuation and partial beam blockage', ['Independent of rain rate', 'Only available for snow', 'Always identical to reflectivity'], 'KDP is a phase measurement and therefore immune to power-related errors.'),
    q('The range-velocity dilemma means that:', 'Raising the PRF extends the unambiguous velocity but shortens the unambiguous range', ['Raising the PRF improves both', 'Both depend only on wavelength', 'Neither depends on PRF'], 'Range and velocity ambiguities pull PRF in opposite directions.'),
    q('High values of spectrum width indicate:', 'Turbulence, shear or a wide range of velocities within the sample volume', ['A perfectly uniform wind field', 'No targets present', 'Only clear-air return'], 'Spectrum width measures the spread of velocities within the pulse volume.'),
    q('For a warning decision, the best practice is to:', 'Use trends across successive volume scans and several products, not a single scan', ['Rely on one reflectivity image', 'Ignore velocity data', 'Wait for damage reports'], 'Persistence and consistency across products build confidence.'),
  ],

  'advanced-radar': [
    q('When mosaicking overlapping radars, pixels should be blended using:', 'Distance and data-quality weights', ['The oldest scan only', 'Random selection', 'Always the highest reflectivity'], 'Weighting prevents noisy far-range data overriding clean near-range data.'),
    q('Radar-gauge merging is used mainly to:', 'Correct systematic biases in radar rainfall estimates', ['Increase radar transmit power', 'Remove the need for gauges', 'Change the radar wavelength'], 'Gauges provide ground truth for bias adjustment.'),
    q('Convective storm nowcasts based on extrapolation lose skill mainly because of:', 'Initiation, growth and decay of storms', ['A lack of computing power', 'Changes in the radar band', 'The colour palette used'], 'Extrapolation cannot predict new storms or storm decay.'),
    q('Blending nowcasts with NWP is most useful:', 'As the lead time increases beyond about one to two hours', ['Only for the first five minutes', 'Never', 'Only when the radar is offline'], 'NWP skill overtakes extrapolation at longer leads.'),
    q('Neighbourhood verification is preferred for high-resolution forecasts because it:', 'Avoids double-penalising small displacement errors', ['Removes the need for observations', 'Always gives higher scores by definition', 'Ignores intensity'], 'A near miss should count for more than a complete miss.'),
    q('R(KDP) estimators are less affected than R(Z) by:', 'Hail contamination and attenuation', ['Rain-rate magnitude', 'Antenna size', 'Pulse width'], 'KDP is a phase-based measurement.'),
    q('A probabilistic nowcast should be communicated as:', 'The probability of exceeding impact-relevant thresholds', ['A single deterministic line', 'A colour without a legend', 'A verbal guess'], 'Probabilities let users match the decision to their own risk tolerance.'),
    q('A useful continuous-improvement practice is to:', 'Maintain a case library and review it regularly', ['Delete old cases', 'Verify only successful forecasts', 'Avoid sharing lessons'], 'Case libraries turn events into learning.'),
  ],

  'forecasting-fundamentals': [
    q('The normal date of southwest monsoon onset over Kerala is:', '1 June', ['1 May', '15 July', '1 September'], 'IMD uses 1 June as the normal onset date over Kerala.'),
    q('Western disturbances mainly affect:', 'Northwest India in winter, bringing rain and mountain snow', ['Peninsular India in monsoon', 'The Andaman Sea only', 'The Thar desert in summer only'], 'Western disturbances are extratropical systems that move in from the west.'),
    q('The monsoon trough is best described as:', 'An elongated low-pressure area from northwest India to the head Bay of Bengal', ['A high-pressure ridge over the Himalaya', 'A jet stream over the Arabian Sea', 'A cold front over Kerala'], 'Its position governs the distribution of monsoon rainfall.'),
    q('A rapid fall in surface pressure generally indicates:', 'An approaching low-pressure system and deteriorating weather', ['Improving weather', 'Instrument failure only', 'A stable anticyclone'], 'Pressure tendency is a key short-term indicator.'),
    q('In the IMD colour-coded warning scheme, an ORANGE warning means:', 'Be prepared', ['No action needed', 'Be aware', 'Take immediate action'], 'Green: no action; Yellow: be aware; Orange: be prepared; Red: take action.'),
    q('A dew-point depression close to zero indicates that the air is:', 'Near saturation, so fog or cloud is likely', ['Very dry', 'Very warm', 'Strongly unstable'], 'Small temperature-dew point difference means near-saturated air.'),
    q('A persistence forecast assumes that:', 'Tomorrow will be the same as today', ['The weather will change completely', 'Models are always right', 'Climatology applies exactly'], 'Persistence is the simplest benchmark forecast.'),
    q('Which observing system provides vertical profiles of temperature, humidity and wind?', 'Radiosonde soundings', ['Rain gauges', 'Anemometers only', 'Tide gauges'], 'Radiosondes measure the upper atmosphere.'),
    q('The best way to communicate forecast uncertainty is to:', 'Use probabilities or ranges and explain what would change the forecast', ['Avoid mentioning it', 'Use technical jargon', 'Issue several conflicting forecasts'], 'Clear uncertainty language supports better decisions.'),
    q('The daily maximum temperature over land usually occurs:', 'In the early-to-mid afternoon', ['At sunrise', 'At local midnight', 'At noon exactly'], 'Heating continues after solar noon until energy balance reverses.'),
    q('For the plains, an IMD heat-wave criterion requires a maximum temperature of at least 40 degrees Celsius and a departure from normal of at least:', '4.5 degrees Celsius', ['0.5 degrees Celsius', '10 degrees Celsius', '20 degrees Celsius'], 'IMD defines a heat wave by both an absolute threshold and a departure from normal.', 2),
    q('Which step comes FIRST in a disciplined forecast process?', 'Analysing the current observed state of the atmosphere', ['Issuing the warning', 'Writing the press release', 'Verifying last month'], 'Analyse, diagnose, prognosticate, then communicate.', 2),
  ],

  'advanced-forecasting': [
    q('Ensemble spread is best interpreted as an indicator of:', 'Forecast predictability', ['Model resolution', 'Observation quality', 'The correct answer'], 'Large spread means low confidence.'),
    q('Forecaster value-add is usually greatest:', 'In the first 12-24 hours and in rapidly evolving situations', ['At day 10', 'Only for climatology', 'Never'], 'Human skill complements models most in the short range.'),
    q('A 30% probability of extreme rainfall can still justify precautionary action when:', 'The potential consequences are severe', ['The model is coarse', 'The forecaster is unsure of the date', 'Probabilities are not used'], 'Decision thresholds depend on impact, not just probability.'),
    q('Heavy rainfall from repeated cells passing over the same location is called:', 'Cell training', ['Frontal lifting', 'Sea breeze convergence', 'Radiative cooling'], 'Training cells produce large local accumulations.'),
    q('A well-structured decision briefing should state:', 'What is expected, where and when, confidence and recommended actions', ['Only the model name', 'Only the temperature', 'Only historical records'], 'Briefings must be actionable.'),
    q('Known systematic model bias should be:', 'Corrected for using experience or post-processing', ['Ignored', 'Hidden from users', 'Treated as random noise'], 'Persistent errors are predictable.'),
    q('For heatwaves, which factor besides maximum temperature matters greatly for health impact?', 'High night-time minimum temperature and humidity', ['Cloud colour', 'Radar frequency', 'Sunrise time'], 'Lack of overnight relief increases heat stress.'),
    q('Orographic enhancement of rainfall occurs when:', 'Moist air is forced to rise over terrain', ['Air descends over mountains', 'Winds are calm', 'Temperature is uniform'], 'Forced ascent cools and condenses moisture.'),
  ],

  'nwp-essentials': [
    q('NWP models are based on the numerical solution of:', 'The primitive equations of atmospheric motion and thermodynamics', ['Statistical regressions only', 'Random walks', 'Historical analogues only'], 'Momentum, energy, continuity and moisture equations.'),
    q('Parameterisation is needed for processes that:', 'Occur at scales smaller than the model grid', ['Are unimportant', 'Only happen at night', 'Are perfectly resolved'], 'Convection, radiation and turbulence are sub-grid.'),
    q('Data assimilation combines:', 'A short-range forecast (background) with observations', ['Two random forecasts', 'Only satellite data', 'Historical means'], 'The analysis is a weighted blend by error statistics.'),
    q('Which is an operational assimilation method?', '4D-Var', ['Simple averaging', 'Coin toss', 'Persistence'], 'Four-dimensional variational assimilation is used at many centres.'),
    q('Convection-permitting models typically use grid spacing of about:', '3 km or finer', ['100 km', '500 km', '1000 km'], 'At this scale deep convection is partly resolved.'),
    q('A common cause of systematic monsoon rainfall errors in models is:', 'Imperfect convection parameterisation', ['Lack of gravity', 'Too many observations', 'Perfect physics'], 'Convection schemes strongly influence rainfall.'),
    q('Model output statistics are used to:', 'Statistically correct systematic forecast errors', ['Create new observations', 'Replace the model', 'Remove uncertainty'], 'MOS maps raw output to observed local values.'),
    q('Before relying on a model run you should check:', 'The cycle time and data cut-off', ['Only its colour scheme', 'Nothing', 'The programmer name'], 'Older runs may be stale.'),
  ],

  'ensemble-verification': [
    q('An under-dispersive ensemble is one whose spread is:', 'Too small compared with actual forecast error', ['Larger than needed', 'Exactly right', 'Unrelated to error'], 'It produces overconfident forecasts.'),
    q('A reliable probabilistic forecast is one where:', 'Forecast probabilities match observed frequencies', ['All probabilities are 50%', 'Probabilities are never used', 'The model is deterministic'], 'Reliability means calibration.'),
    q('The Brier score is best when it is:', 'Close to 0', ['Close to 1', 'Negative', 'Equal to 0.5'], 'It is a mean squared error of probabilities; lower is better.'),
    q('The CRPS is used to evaluate:', 'Probabilistic forecasts of continuous variables', ['Only wind direction', 'Only yes/no events', 'Instrument drift'], 'It generalises the Brier score.'),
    q('A hazard of calibrating ensembles with a long training archive is that:', 'Model upgrades may make the archive unrepresentative', ['Calibration is impossible', 'It always improves skill', 'Archives cannot be stored'], 'Changing model versions changes error characteristics.'),
    q('A spread-skill relationship is desirable because it shows that:', 'Larger spread signals larger expected error', ['Spread is random', 'Skill never varies', 'Spread equals bias'], 'Flow-dependent uncertainty is captured.'),
  ],

  'satellite-meteorology': [
    q('Visible satellite imagery is available:', 'Only during daytime', ['Only at night', 'Always', 'Only over oceans'], 'It relies on reflected sunlight.'),
    q('In infrared imagery, colder cloud tops generally indicate:', 'Higher clouds', ['Lower clouds', 'Clear sky', 'Warmer oceans'], 'Temperature decreases with height in the troposphere.'),
    q('Bright and very cold clouds in visible and infrared images typically indicate:', 'Deep convection', ['Fog', 'Clear sky', 'Dust at the surface'], 'Thick, high cloud tops are bright and cold.'),
    q('Water-vapour channel imagery mainly shows:', 'Moisture in the upper troposphere and dynamic features such as jets', ['Surface temperature', 'Only cloud colour', 'City lights'], 'It highlights upper-level moisture patterns.'),
    q('A geostationary satellite orbits at about:', '36,000 km above the equator', ['400 km', '800 km', '100,000 km'], 'Geostationary altitude is about 35,786 km.'),
    q('Low values of outgoing longwave radiation (OLR) typically indicate:', 'Deep, cold cloud tops (active convection)', ['Clear skies', 'Cold surface only', 'No clouds'], 'Cold cloud tops emit little longwave radiation.'),
    q('Night-time fog detection commonly uses:', 'The brightness temperature difference between 3.9 and 10.8 micrometre channels', ['Only the visible channel', 'Radar', 'Rain gauges'], 'Water clouds emit differently at these two wavelengths.'),
    q('Thin cirrus can be misinterpreted in IR imagery because:', 'It is cold but semi-transparent, so the measured temperature is misleading', ['It is very thick', 'It is warmer than the ground', 'It cannot be seen'], 'Cirrus transmits some radiation from below.'),
    q('Compared with geostationary satellites, polar-orbiting satellites generally provide:', 'Higher spatial resolution but less frequent coverage of a given location', ['Continuous coverage', 'No imagery', 'Lower resolution and more frequent images'], 'They are closer to Earth but pass over a location only a few times a day.'),
    q('Rapid cooling of cloud tops over time is an early sign of:', 'Intensifying convection', ['Decaying storms', 'Clear skies', 'Sensor failure'], 'Rising tops cool quickly.'),
  ],

  'advanced-satellite': [
    q('The Dvorak technique estimates tropical cyclone intensity from:', 'Cloud patterns in satellite imagery', ['Rain gauges only', 'Radiosondes only', 'Ship logs only'], 'Patterns map to T-numbers and wind speeds.'),
    q('Microwave imagery is valuable for cyclones because it:', 'Can reveal eyewall structure beneath cirrus cloud', ['Shows only sunlight', 'Cannot penetrate clouds', 'Measures temperature of stars'], 'Microwave energy passes through non-precipitating ice cloud.'),
    q('RGB composites are used to:', 'Highlight hazards such as fog, dust and convective microphysics using channel combinations', ['Add random colour', 'Remove data', 'Replace calibration'], 'Recipes map channels to red, green and blue.'),
    q('Every satellite retrieval should be accompanied by:', 'An estimate of its uncertainty', ['No caveats', 'Only a colour', 'A guess of the date'], 'Users need confidence information.'),
    q('Scatterometer data are used to obtain:', 'Ocean surface wind vectors', ['Rainfall over land', 'Air quality', 'Snow depth'], 'They infer wind from sea-surface roughness.'),
    q('An indicator of possible rapid intensification is:', 'Low vertical shear over very warm, deep ocean with a well-organised core', ['High shear and cold water', 'Absence of convection', 'Land interaction'], 'Favourable environment plus inner-core organisation.'),
  ],

  'atmospheric-dynamics': [
    q('The dry adiabatic lapse rate is about:', '9.8 K per km', ['2 K per km', '20 K per km', '0 K per km'], 'Unsaturated rising air cools at about 9.8 K/km.'),
    q('Geostrophic wind results from a balance between:', 'The pressure-gradient force and the Coriolis force', ['Friction and gravity', 'Buoyancy and viscosity', 'Radiation and conduction'], 'It blows parallel to isobars.'),
    q('The thermal wind is proportional to:', 'The horizontal temperature gradient', ['The surface pressure', 'Humidity alone', 'The time of day'], 'Vertical shear of the geostrophic wind reflects horizontal temperature gradients.'),
    q('CAPE measures:', 'The energy available for convection (buoyancy of a lifted parcel)', ['Only surface temperature', 'Wind shear', 'Cloud colour'], 'Convective Available Potential Energy integrates positive buoyancy.'),
    q('Which combination favours large-scale ascent in QG theory?', 'Increasing positive vorticity advection with height and warm-air advection', ['Cold advection only', 'Negative vorticity advection only', 'Calm conditions'], 'Both contribute to forcing for ascent.'),
    q('The Coriolis parameter is:', '2 x Omega x sin(latitude)', ['g x sin(latitude)', 'Omega / latitude', 'Independent of latitude'], 'It vanishes at the equator and increases towards the poles.'),
    q('Hydrostatic balance is a balance between:', 'The vertical pressure-gradient force and gravity', ['Coriolis and friction', 'Temperature and humidity', 'Wind and waves'], 'Pressure decreases with height in proportion to air density.'),
    q('An active spell of the Indian monsoon is associated with:', 'A monsoon trough displaced towards its normal position and vigorous rainfall', ['A trough shifted to the Himalayan foothills', 'No cloud', 'Clear skies over central India'], 'Break spells occur when the trough shifts north to the foothills.'),
  ],

  'python-met-data': [
    q('Which library is designed for labelled multi-dimensional arrays such as NetCDF data?', 'xarray', ['Flask', 'Tkinter', 'PyGame'], 'xarray provides labelled arrays with coordinates.'),
    q('In pandas, which method changes time-series frequency, for example daily to monthly?', 'resample', ['sortkeys', 'pivotize', 'reload'], 'resample aggregates onto a new time index.'),
    q('Missing values in pandas are typically represented by:', 'NaN', ['Zero', 'Empty string', 'Infinity'], 'NaN marks missing numeric data.'),
    q('Why use an isolated virtual environment?', 'To make analyses reproducible with pinned package versions', ['To make code run slower', 'To hide code', 'To avoid using libraries'], 'Environments capture dependencies.'),
    q('A climatology by calendar month can be computed with:', 'groupby on the month and then taking the mean', ['Sorting alphabetically', 'Deleting duplicates', 'Rounding'], 'Group by month, then average across years.'),
    q('When handling missing data you should:', 'Decide explicitly and document how gaps are treated', ['Silently fill them with zero', 'Ignore them', 'Delete the file'], 'Silent fills bias results.'),
    q('A good notebook practice is to:', 'Keep one purpose per notebook, with inputs at the top and results at the end', ['Mix unrelated analyses', 'Hard-code secrets in cells', 'Avoid comments'], 'Structure improves reuse and review.'),
    q('An anomaly is computed by:', 'Subtracting the climatological mean from the observation', ['Adding the mean', 'Dividing by zero', 'Sorting the data'], 'Anomaly = value - climatology.'),
  ],

  'climate-data-analysis': [
    q('The current WMO standard climatological normal period is:', '1991-2020', ['1901-1930', '2001-2010', '1500-1600'], 'WMO updates normals every 30 years, with the current one being 1991-2020.'),
    q('A climate anomaly is:', 'A departure from the average over a reference period', ['The average itself', 'A forecast error', 'A station name'], 'Always report the reference period.'),
    q('A robust, non-parametric trend estimator is:', 'The Theil-Sen slope', ['Adding all values', 'Sorting by name', 'Multiplying by ten'], 'It is resistant to outliers.'),
    q('Serial autocorrelation in a time series tends to:', 'Overstate the statistical significance of a trend', ['Reduce all trends to zero', 'Make data perfect', 'Have no effect'], 'Effective sample size is smaller than the number of points.'),
    q('Consecutive dry days (CDD) is an example of:', 'A climate extreme index', ['A wind product', 'A satellite channel', 'A radar mode'], 'ETCCDI indices summarise extremes.'),
    q('Homogenisation of station records is done to:', 'Remove non-climatic breaks such as station moves or instrument changes', ['Create more data', 'Change the trend on purpose', 'Delete the record'], 'Artificial shifts can masquerade as climate change.'),
    q('When communicating climate results you should:', 'State the baseline, data limitations and uncertainty', ['Hide assumptions', 'Attribute any single event to climate change without evidence', 'Use only colour'], 'Transparency builds trust.'),
    q('Extreme indices matter because:', 'Changes in tails can differ from and matter more than changes in the mean', ['Means never change', 'Extremes are irrelevant', 'They replace observations'], 'Impacts are often driven by extremes.'),
  ],

  'data-visualisation': [
    q('Which visual encoding do people judge most accurately?', 'Position along a common scale', ['Colour hue', 'Area', 'Angle'], 'Position and length are the most accurate channels.'),
    q('A bar chart should generally:', 'Start its value axis at zero', ['Use a truncated axis', 'Use 3D effects', 'Hide axis labels'], 'Truncation exaggerates differences.'),
    q('The most appropriate chart to show change over time is a:', 'Line chart', ['Pie chart', 'Word cloud', 'Radar chart'], 'Lines show trends across ordered time.'),
    q('To be accessible, a chart should:', 'Not rely on colour alone to convey meaning', ['Use red and green only', 'Use tiny fonts', 'Avoid legends'], 'Colour-blind users need additional cues.'),
    q('A heatmap is best suited to showing:', 'Values across two categorical dimensions', ['A single number', 'Only names', 'Time only'], 'Colour encodes the value in each cell.'),
    q('Dashboards should lead with:', 'The most important numbers for the decision at hand', ['Decoration', 'Every available metric', 'Random charts'], 'Prioritise key messages.'),
  ],

  'disaster-risk-management': [
    q('Risk is commonly described as arising from the combination of:', 'Hazard, exposure and vulnerability', ['Only rainfall', 'Only wind', 'Only the radar type'], 'All three shape the impact.'),
    q('Impact-based forecasting focuses on:', 'What the weather will DO, not only what it will be', ['Only temperature', 'Only pressure', 'Only satellites'], 'It links hazards to consequences.'),
    q('Warnings are most effective when they are:', 'Timely, specific, consistent across agencies and include recommended actions', ['Long and technical', 'Different from each agency', 'Issued after the event'], 'Consistency and actionability drive response.'),
    q('The Common Alerting Protocol (CAP) is:', 'A standard format for exchanging public warnings', ['A radar mode', 'A satellite', 'A model'], 'CAP standardises alert messages.'),
    q('A risk matrix for warnings combines:', 'Likelihood of the hazard and severity of its impact', ['Temperature and humidity', 'Time and date', 'Colour and font'], 'Warning levels come from likelihood x impact.'),
    q('After a major event, the best practice is to:', 'Run an after-action review and capture lessons', ['Avoid discussion', 'Delete records', 'Blame individuals'], 'Learning loops improve preparedness.'),
    q('Evacuation triggers should be agreed:', 'In advance with local authorities', ['During the event only', 'By the media', 'Never'], 'Pre-agreed thresholds save time.'),
    q('The same rainfall amount can have very different impacts because of differences in:', 'Exposure and vulnerability', ['Colour of clouds', 'Radar band', 'Time zone'], 'Local conditions determine consequences.'),
  ],

  'cyclone-warning': [
    q('A typical minimum sea-surface temperature for tropical cyclone development is about:', '26.5 degrees Celsius', ['10 degrees Celsius', '15 degrees Celsius', '5 degrees Celsius'], 'Warm water supplies heat and moisture.'),
    q('Tropical cyclone intensification is favoured by:', 'Low vertical wind shear', ['Very high vertical wind shear', 'Cold water', 'Dry mid-level air only'], 'Shear disrupts the vertical structure.'),
    q('In the IMD classification, a wind of 64-89 knots is called a:', 'Very Severe Cyclonic Storm', ['Depression', 'Cyclonic Storm', 'Super Cyclonic Storm'], 'Cyclonic storm 34-47, severe 48-63, very severe 64-89, extremely severe 90-119, super at least 120 knots.'),
    q('Compared with intensity forecasts, track forecasts are generally:', 'More skilful', ['Less skilful', 'Impossible', 'Unrelated to models'], 'Steering flow is better predicted than internal dynamics.'),
    q('Landfall is defined as:', 'The centre of the cyclone crossing the coast', ['Any rain at the coast', 'The outer band touching land', 'A satellite pass'], 'The centre, not the rain, defines landfall.'),
    q('A major life-threatening hazard from a landfalling cyclone besides wind is:', 'Storm surge', ['Solar eclipse', 'Ozone depletion', 'Pollen'], 'Surge causes coastal inundation.'),
    q('The cone of uncertainty in a track forecast represents:', 'Where the centre is likely to go, based on past forecast errors', ['The area of rain only', 'The size of the eye', 'The wind radius'], 'It reflects track error statistics.'),
    multi('Which TWO are important for coordinating landfall messaging?', ['Frequent, consistent updates to state authorities', 'A single source of truth for the latest advisory'], ['Contradictory bulletins from different offices', 'Waiting until after landfall'], 'Consistency and frequency build trust and enable action.'),
  ],
};
