/**
 * Practical scenarios for the demonstration.
 *
 * Each one is a written exercise, not an IMD operational procedure: the
 * situations are invented, and the "best" decision is the one this training
 * material teaches, not an official instruction. Every scenario is presented in
 * the application as a simulated exercise.
 *
 * What makes these different from quiz questions is partial credit. Several
 * decisions are defensible on shift - waiting for one more scan is not wrong,
 * it just costs lead time - so an option can be worth part of its step's marks.
 */

export interface ScenarioOptionSeed {
  text: string;
  /** 0 is wrong, 1 is the decision this training teaches; between is partly defensible. */
  credit: number;
  rationale?: string;
}

export interface ScenarioStepSeed {
  type: 'IDENTIFY' | 'INTERPRET' | 'ACTION';
  prompt: string;
  marks: number;
  explanation?: string;
  options: ScenarioOptionSeed[];
}

export interface ScenarioSeed {
  title: string;
  briefing: string;
  steps: ScenarioStepSeed[];
}

/**
 * Scenarios by course key, with the share of the final mark that stays with the
 * written questions. A course with scenarios is marked on both halves.
 */
export const PRACTICAL_SCENARIOS: Record<string, { mcqWeight: number; scenarios: ScenarioSeed[] }> = {
  'cyclone-warning': {
    mcqWeight: 0.6,
    scenarios: [
      {
        title: 'A deepening system off the east coast',
        briefing:
          'Simulated exercise. You are on the cyclone desk at 0300 IST. Over the last three hours, satellite imagery shows the eye of a system 220 km east-south-east of the coast becoming better defined, and the cloud tops around it have cooled. The coastal radar is at the edge of its useful range. The district administration has a fishing community of about 4,000 people along 30 km of coast, and the local boats normally sail at first light.',
        steps: [
          {
            type: 'IDENTIFY',
            prompt: 'Which observation carries the most weight for what you have to decide in the next hour?',
            marks: 4,
            explanation:
              'Lead time is the scarce resource at 0300. The eye becoming better defined while cloud tops cool is the clearest early evidence of intensification, and it is available now; the other sources either lag or add little at this range.',
            options: [
              { text: 'The eye becoming better defined while cloud tops cool', credit: 1, rationale: 'The clearest evidence available at this hour, and the one with operational consequences before dawn.' },
              { text: 'Radial velocity from the coastal radar at the edge of its range', credit: 0.5, rationale: 'Useful when it is in range, but at 220 km the beam is too high to sample the low-level circulation well.' },
              { text: 'The latest global model run from twelve hours ago', credit: 0.25, rationale: 'Model guidance matters for the track, but a twelve-hour-old run will not resolve what changed in the last three hours.' },
              { text: 'Coastal station pressure tendency alone', credit: 0.25, rationale: 'A real signal, but too far from the system to tell you much yet.' },
            ],
          },
          {
            type: 'INTERPRET',
            prompt: 'What is the most defensible interpretation to put in your internal note?',
            marks: 3,
            options: [
              { text: 'Intensification is under way; treat the current intensity estimate as a lower bound', credit: 1, rationale: 'States what the evidence supports and flags the uncertainty in the right direction.' },
              { text: 'The system is intensifying and will reach severe cyclonic storm intensity before landfall', credit: 0.25, rationale: 'Over-commits. The evidence supports intensification, not a specific category at a specific time.' },
              { text: 'The apparent change is an artefact of the satellite viewing angle', credit: 0, rationale: 'Not supported: cooling cloud tops and a clearing eye are not viewing-angle effects.' },
              { text: 'No interpretation yet; wait for the next fix before writing anything down', credit: 0.5, rationale: 'Caution is reasonable, but an internal note costs nothing and preserves the reasoning for the next shift.' },
            ],
          },
          {
            type: 'ACTION',
            prompt: 'What do you do before first light?',
            marks: 5,
            explanation:
              'The fishing fleet sails at dawn, so the decision has a deadline that the data does not. Warning the district administration now preserves the option to act; everything else can follow.',
            options: [
              { text: 'Brief the district administration now, flagging the risk to the morning fishing fleet', credit: 1, rationale: 'Acts while the warning can still change what happens, and puts the decision with the authority that owns it.' },
              { text: 'Issue the routine bulletin on schedule and note the intensification in it', credit: 0.5, rationale: 'The information gets out, but the routine schedule may not reach the fleet before it sails.' },
              { text: 'Wait for the 0600 satellite pass to confirm before contacting anyone', credit: 0.25, rationale: 'Defensible caution, but it spends the lead time that makes the warning useful.' },
              { text: 'Escalate to the national centre and take no local action until they respond', credit: 0.25, rationale: 'Escalation is right, but not instead of the local warning you are able to give.' },
            ],
          },
        ],
      },
    ],
  },
  'doppler-radar': {
    mcqWeight: 0.65,
    scenarios: [
      {
        title: 'A velocity couplet on the evening scan',
        briefing:
          'Simulated exercise. On the 1830 IST volume scan, the radar shows a small area of strong inbound velocities directly adjacent to strong outbound velocities, about 40 km from the radar, within a line of convection moving towards a district town. Reflectivity in the same area is moderate, with a weak hook on its southern flank. The previous two scans show the feature tightening.',
        steps: [
          {
            type: 'IDENTIFY',
            prompt: 'What does the adjacent inbound and outbound velocity pair most likely represent?',
            marks: 4,
            explanation: 'Adjacent inbound and outbound velocities over a small area is the classic signature of rotation, and it is tightening over successive scans.',
            options: [
              { text: 'Rotation within the storm', credit: 1, rationale: 'The standard reading of a velocity couplet, supported here by the hook and the tightening trend.' },
              { text: 'Range folding of velocities beyond the unambiguous range', credit: 0.25, rationale: 'Worth ruling out, but folding does not usually tighten coherently over three scans alongside a hook.' },
              { text: 'Ground clutter near a ridge line', credit: 0, rationale: 'Clutter does not move with the convective line or produce a coherent couplet at 40 km.' },
              { text: 'A second storm cell overlapping in the beam', credit: 0.25, rationale: 'Possible in principle, but it would not produce the paired inbound and outbound pattern this tightly.' },
            ],
          },
          {
            type: 'ACTION',
            prompt: 'The district town is about 25 minutes downstream. What is the most appropriate next step?',
            marks: 6,
            options: [
              { text: 'Issue a nowcast for the district and tell the duty officer what you are seeing', credit: 1, rationale: 'Twenty-five minutes is usable lead time, and the evidence is strong enough to act on.' },
              { text: 'Wait one more volume scan to see whether the rotation persists', credit: 0.4, rationale: 'A reasonable instinct, but a scan cycle is a large share of the remaining lead time.' },
              { text: 'Check the dual-polarisation products first, then decide', credit: 0.5, rationale: 'Good practice when time allows; here it can be done alongside the warning rather than before it.' },
              { text: 'Record the observation for the post-event review and continue monitoring', credit: 0, rationale: 'Leaves the people downstream with no warning at all.' },
            ],
          },
        ],
      },
    ],
  },
};
