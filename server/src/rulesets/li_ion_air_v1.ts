export type DGProfile = {
  un: string;
  pi: string | null;
  requires_shipper_decl: boolean;
  labels: string[];
};

export function classify(input: {
  battery_configuration: string;
  wh_or_li_content: string;
  qty_per_pkg: number;
  un_number: string;
  pi_candidate?: string;
}): DGProfile {
  const isLiIon = input.un_number.startsWith('UN348');
  const pi = input.pi_candidate && input.pi_candidate !== 'unknown' ? input.pi_candidate : (isLiIon ? 'PI965' : 'PI968');
  const requires = input.qty_per_pkg > 2 || /(^9\d|1\d\d)/.test(input.wh_or_li_content); // placeholder rule
  const labels = [requires ? 'Class 9' : 'Lithium Battery Mark'];
  return { un: input.un_number, pi, requires_shipper_decl: requires, labels };
}
