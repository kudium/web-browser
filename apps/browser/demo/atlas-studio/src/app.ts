export type Project = { name: string; status: 'In progress' | 'Ready'; tasks: number };

export const projects: Project[] = [
  { name: 'Coastal collection', status: 'In progress', tasks: 8 },
  { name: 'Summer editorial', status: 'Ready', tasks: 12 },
  { name: 'Studio website', status: 'In progress', tasks: 5 },
];

export function completion(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
