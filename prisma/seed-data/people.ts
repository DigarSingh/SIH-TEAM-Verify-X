import type { DepartmentCode, RoleCode } from './framework';

export interface PersonSeed {
  name: string;
  dept: DepartmentCode;
  role: RoleCode;
  location: string;
  designation: string;
  /** Overall aptitude offset applied to every competency baseline (-0.1 .. +0.1). */
  ability?: number;
}

/**
 * Baseline attainment (fraction of the required level) by department and competency.
 * Chosen to tell a believable organisational story: forecasters are strong at
 * forecasting but weak on radar, radar operators are strong on radar but weaker on
 * data skills, and so on - which is what makes the heatmap and training-needs
 * views interesting.
 */
export const DEPARTMENT_PROFILE: Record<DepartmentCode, Partial<Record<string, number>>> = {
  FC: { FORECASTING: 0.92, RADAR: 0.47, NWP: 0.7, SATELLITE: 0.85, ATMOSPHERIC: 0.9, DATA: 0.62, CLIMATE: 0.85, DRM: 0.66 },
  RD: { RADAR: 0.95, FORECASTING: 0.8, ATMOSPHERIC: 0.85, DATA: 0.58, SATELLITE: 0.62, DRM: 0.6 },
  SAT: { SATELLITE: 0.92, FORECASTING: 0.8, ATMOSPHERIC: 0.8, DATA: 0.75, CLIMATE: 0.68 },
  CLR: { CLIMATE: 0.95, ATMOSPHERIC: 0.9, DATA: 0.85, NWP: 0.58, FORECASTING: 0.8 },
  NWP: { NWP: 0.95, ATMOSPHERIC: 0.9, DATA: 0.9, FORECASTING: 0.8, CLIMATE: 0.8 },
  CDW: { DRM: 0.85, FORECASTING: 0.9, SATELLITE: 0.85, RADAR: 0.52, NWP: 0.62 },
  HRD: { DATA: 0.85, DRM: 0.8 },
};

export const TRAINEES: PersonSeed[] = [
  // Forecasting - Severe Weather Forecasters (the demo trainee, Dr. Ananya Rao, is added separately)
  { name: 'Rahul Sharma', dept: 'FC', role: 'SWF', location: 'Mumbai', designation: 'Meteorologist' },
  { name: 'Anita Verma', dept: 'FC', role: 'SWF', location: 'Patna', designation: 'Meteorologist', ability: 0.05 },
  { name: 'Ritu Malhotra', dept: 'FC', role: 'SWF', location: 'Lucknow', designation: 'Scientist B', ability: 0.06 },
  { name: 'Karthik Subramanian', dept: 'FC', role: 'SWF', location: 'Chennai', designation: 'Scientific Assistant', ability: -0.04 },
  { name: 'Sneha Kulkarni', dept: 'FC', role: 'SWF', location: 'Pune', designation: 'Meteorologist' },
  { name: 'Imran Qureshi', dept: 'FC', role: 'SWF', location: 'Hyderabad', designation: 'Scientist B', ability: 0.03 },
  { name: 'Pooja Nair', dept: 'FC', role: 'SWF', location: 'Thiruvananthapuram', designation: 'Scientific Assistant', ability: -0.06 },
  { name: 'Vivek Chauhan', dept: 'FC', role: 'SWF', location: 'Dehradun', designation: 'Meteorologist' },
  { name: 'Divya Menon', dept: 'FC', role: 'SWF', location: 'Kochi', designation: 'Scientist C', ability: 0.08 },
  { name: 'Harpreet Singh', dept: 'FC', role: 'SWF', location: 'Chandigarh', designation: 'Meteorologist', ability: -0.02 },
  { name: 'Lakshmi Iyer', dept: 'FC', role: 'SWF', location: 'Bengaluru', designation: 'Scientific Assistant' },
  { name: 'Sunil Patil', dept: 'FC', role: 'SWF', location: 'Nagpur', designation: 'Meteorologist', ability: -0.05 },
  { name: 'Meenakshi Rao', dept: 'FC', role: 'SWF', location: 'Guwahati', designation: 'Scientist B', ability: 0.02 },
  { name: 'Deepak Joshi', dept: 'FC', role: 'SWF', location: 'Jaipur', designation: 'Meteorologist' },
  // Radar Operations - Radar Meteorologists
  { name: 'Aman Kumar', dept: 'RD', role: 'RDM', location: 'Chennai', designation: 'Technical Officer', ability: -0.05 },
  { name: 'Joseph Mathew', dept: 'RD', role: 'RDM', location: 'Thiruvananthapuram', designation: 'Technical Officer' },
  { name: 'Suresh Menon', dept: 'RD', role: 'RDM', location: 'Kochi', designation: 'Senior Technical Officer', ability: 0.06 },
  { name: 'Tanvi Deshpande', dept: 'RD', role: 'RDM', location: 'Mumbai', designation: 'Scientist B', ability: 0.04 },
  { name: 'Ashok Reddy', dept: 'RD', role: 'RDM', location: 'Visakhapatnam', designation: 'Technical Officer' },
  { name: 'Nisha Bhatt', dept: 'RD', role: 'RDM', location: 'Ahmedabad', designation: 'Scientific Assistant', ability: -0.03 },
  // Satellite Services - Satellite Meteorologists
  { name: 'Sanjay Nair', dept: 'SAT', role: 'SATM', location: 'Ahmedabad', designation: 'Scientific Assistant' },
  { name: 'Gaurav Joshi', dept: 'SAT', role: 'SATM', location: 'Jaipur', designation: 'Scientist B', ability: 0.05 },
  { name: 'Priyanka Das', dept: 'SAT', role: 'SATM', location: 'Kolkata', designation: 'Scientist C', ability: 0.07 },
  { name: 'Manish Tiwari', dept: 'SAT', role: 'SATM', location: 'Bhopal', designation: 'Scientific Assistant', ability: -0.04 },
  { name: 'Zoya Khan', dept: 'SAT', role: 'SATM', location: 'New Delhi', designation: 'Scientist B' },
  // Climate Research - Climate Scientists
  { name: 'Priya Singh', dept: 'CLR', role: 'CLS', location: 'Pune', designation: 'Research Associate', ability: 0.03 },
  { name: 'Kavita Rao', dept: 'CLR', role: 'CLS', location: 'New Delhi', designation: 'Scientist B', ability: 0.08 },
  { name: 'Ramesh Yadav', dept: 'CLR', role: 'CLS', location: 'Bhopal', designation: 'Technical Officer', ability: -0.06 },
  { name: 'Farhan Ali', dept: 'CLR', role: 'CLS', location: 'Srinagar', designation: 'Scientist C' },
  { name: 'Shalini Gupta', dept: 'CLR', role: 'CLS', location: 'Shimla', designation: 'Research Associate' },
  // NWP - NWP Scientists
  { name: 'Vikram Das', dept: 'NWP', role: 'NWPS', location: 'Bengaluru', designation: 'Scientific Assistant', ability: 0.02 },
  { name: 'Madhav Patil', dept: 'NWP', role: 'NWPS', location: 'Nagpur', designation: 'Scientific Assistant', ability: -0.05 },
  { name: 'Neelam Saxena', dept: 'NWP', role: 'NWPS', location: 'Noida', designation: 'Scientist C', ability: 0.06 },
  { name: 'Rajiv Bansal', dept: 'NWP', role: 'NWPS', location: 'New Delhi', designation: 'Scientist B' },
  // Cyclone & Disaster Warning - Cyclone Warning Officers
  { name: 'Debashish Roy', dept: 'CDW', role: 'CWO', location: 'Bhubaneswar', designation: 'Scientist C', ability: 0.05 },
  { name: 'Sushmita Panda', dept: 'CDW', role: 'CWO', location: 'Bhubaneswar', designation: 'Scientist B' },
  { name: 'Arvind Naidu', dept: 'CDW', role: 'CWO', location: 'Visakhapatnam', designation: 'Meteorologist', ability: -0.04 },
  { name: 'Bhavna Shah', dept: 'CDW', role: 'CWO', location: 'Ahmedabad', designation: 'Meteorologist' },
  // Data analysts
  { name: 'Farah Siddiqui', dept: 'NWP', role: 'MDA', location: 'Hyderabad', designation: 'Scientist C', ability: 0.06 },
  { name: 'Nandita Sen', dept: 'CLR', role: 'MDA', location: 'Guwahati', designation: 'Scientist B' },
  { name: 'Yash Agarwal', dept: 'NWP', role: 'MDA', location: 'New Delhi', designation: 'Scientific Assistant', ability: -0.03 },
];

/** Registrations waiting in the admin approval queue. */
export const PENDING: { name: string; dept: DepartmentCode; role: RoleCode; location: string; designation: string }[] = [
  { name: 'Ishaan Malik', dept: 'FC', role: 'SWF', location: 'Srinagar', designation: 'Scientific Assistant' },
  { name: 'Tara Fernandes', dept: 'SAT', role: 'SATM', location: 'Panaji', designation: 'Meteorologist' },
  { name: 'Omkar Jadhav', dept: 'RD', role: 'RDM', location: 'Mumbai', designation: 'Technical Officer' },
];

export const QUALIFICATIONS = [
  { degree: 'M.Sc.', institution: 'Indian Institute of Tropical Meteorology, Pune', fieldOfStudy: 'Atmospheric Science' },
  { degree: 'M.Sc.', institution: 'University of Delhi', fieldOfStudy: 'Physics' },
  { degree: 'M.Tech.', institution: 'IIT Delhi', fieldOfStudy: 'Atmospheric and Space Sciences' },
  { degree: 'M.Sc.', institution: 'Cochin University of Science and Technology', fieldOfStudy: 'Atmospheric Sciences' },
  { degree: 'B.Tech.', institution: 'NIT Rourkela', fieldOfStudy: 'Electronics and Communication' },
  { degree: 'M.Sc.', institution: 'Andhra University', fieldOfStudy: 'Meteorology and Oceanography' },
  { degree: 'M.Sc.', institution: 'Banaras Hindu University', fieldOfStudy: 'Geophysics' },
  { degree: 'Ph.D.', institution: 'IISc Bengaluru', fieldOfStudy: 'Climate Science' },
];

export const SKILLS = ['Synoptic analysis', 'Python', 'GrADS', 'Doppler radar', 'GIS', 'Nowcasting', 'Statistics', 'Satellite imagery', 'Data visualisation', 'NetCDF', 'Technical writing', 'Public communication'];

export const FEEDBACK_COMMENTS = [
  'Clear explanations and very relevant to day-to-day forecasting.',
  'The case studies were excellent. I could apply them the next week.',
  'Good pace. I would like more practice exercises in the later modules.',
  'Well structured and the assessment was fair.',
  'Useful reference material. The handbook is a keeper.',
  'A bit theoretical in places, but the operational examples helped.',
  'Great trainer support and practical focus.',
  'Excellent course - it closed a real gap in my knowledge.',
];

export const EVALUATION_COMMENTS = [
  'Strong grasp of the fundamentals and applies them well in live cases.',
  'Participates actively and asks good questions. Practical work is improving steadily.',
  'Solid technical knowledge; should practise communicating uncertainty more clearly.',
  'Handled the practical exercise confidently and explained the reasoning clearly.',
  'Good progress since the last review. Keep working on interpreting borderline cases.',
];
