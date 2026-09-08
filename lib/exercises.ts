export type ExerciseDefinition = {
  id: string;
  name: string;
  group: string;
  equipment: string;
  load: 'total' | 'perHand' | 'bodyweight';
  weightLabel: string;
  hint: string;
  aliases: string[];
  bodyOnly?: boolean;
};
const groups: Record<string, [string, string, string, string?][]> = {
  胸: [
    ['bench-press', '杠铃卧推', 'barbell', '平板卧推'],
    ['incline-bench', '上斜杠铃卧推', 'barbell'],
    ['decline-bench', '下斜杠铃卧推', 'barbell'],
    ['dumbbell-bench', '哑铃卧推', 'dumbbell'],
    ['incline-dumbbell', '上斜哑铃卧推', 'dumbbell'],
    ['dumbbell-fly', '哑铃飞鸟', 'dumbbell'],
    ['incline-fly', '上斜哑铃飞鸟', 'dumbbell'],
    ['machine-press', '器械推胸', 'machine', '坐姿推胸'],
    ['pec-deck', '蝴蝶机夹胸', 'machine'],
    ['cable-fly', '绳索夹胸', 'cablePair', '龙门架夹胸'],
    ['pushup', '俯卧撑', 'body'],
    ['dips', '双杠臂屈伸', 'body'],
    ['weighted-dips', '负重双杠臂屈伸', 'weighted'],
  ],
  背: [
    ['lat-pulldown', '高位下拉', 'machine'],
    ['seated-row', '坐姿划船', 'machine'],
    ['barbell-row', '杠铃俯身划船', 'barbell'],
    ['dumbbell-row', '单臂哑铃划船', 'singleSide'],
    ['chest-supported-row', '胸托哑铃划船', 'dumbbell'],
    ['tbar-row', 'T杠划船', 'plate'],
    ['straight-arm-pulldown', '直臂下拉', 'machine'],
    ['pullup', '引体向上', 'body'],
    ['chinup', '反握引体向上', 'body'],
    ['weighted-pullup', '负重引体向上', 'weighted'],
    ['deadlift', '杠铃硬拉', 'barbell'],
    ['back-extension', '背部挺身', 'body'],
  ],
  肩: [
    ['barbell-press', '杠铃推举', 'barbell', '站姿推举'],
    ['dumbbell-press', '哑铃肩推', 'dumbbell'],
    ['arnold-press', '阿诺德推举', 'dumbbell'],
    ['lateral-raise', '哑铃侧平举', 'dumbbell'],
    ['front-raise', '哑铃前平举', 'dumbbell'],
    ['rear-delt-fly', '俯身哑铃飞鸟', 'dumbbell'],
    ['reverse-pec-deck', '反向蝴蝶机', 'machine'],
    ['face-pull', '绳索面拉', 'machine'],
    ['barbell-shrug', '杠铃耸肩', 'barbell'],
    ['dumbbell-shrug', '哑铃耸肩', 'dumbbell'],
  ],
  腿: [
    ['squat', '杠铃深蹲', 'barbell'],
    ['front-squat', '杠铃前蹲', 'barbell'],
    ['goblet-squat', '高脚杯深蹲', 'single'],
    ['leg-press', '腿举', 'machine'],
    ['hack-squat', '哈克深蹲', 'machine'],
    ['split-squat', '哑铃保加利亚分腿蹲', 'dumbbellSide'],
    ['dumbbell-lunge', '哑铃弓步蹲', 'dumbbellSide'],
    ['leg-extension', '腿屈伸', 'machine'],
    ['leg-curl', '坐姿腿弯举', 'machine'],
    ['lying-leg-curl', '俯卧腿弯举', 'machine'],
    ['romanian-deadlift', '罗马尼亚硬拉', 'barbell'],
    ['calf-raise', '站姿器械提踵', 'machine'],
    ['seated-calf', '坐姿提踵', 'machine'],
  ],
  臀: [
    ['hip-thrust', '杠铃臀推', 'barbell'],
    ['glute-bridge', '臀桥', 'body'],
    ['hip-abduction', '器械髋外展', 'machine'],
    ['hip-adduction', '器械髋内收', 'machine'],
    ['cable-kickback', '绳索臀后踢', 'machineSide'],
  ],
  手臂: [
    ['barbell-curl', '杠铃弯举', 'barbell'],
    ['dumbbell-curl', '哑铃弯举', 'dumbbell'],
    ['hammer-curl', '哑铃锤式弯举', 'dumbbell'],
    ['incline-curl', '上斜哑铃弯举', 'dumbbell'],
    ['preacher-curl', '牧师凳弯举', 'barbell'],
    ['cable-curl', '绳索弯举', 'machine'],
    ['triceps-pushdown', '绳索下压', 'machine', '三头下压'],
    ['lying-triceps', '杠铃仰卧臂屈伸', 'barbell'],
    ['overhead-triceps', '哑铃过顶臂屈伸', 'single'],
    ['close-grip-bench', '窄握杠铃卧推', 'barbell'],
    ['wrist-curl', '杠铃腕弯举', 'barbell'],
  ],
  核心: [
    ['crunch', '卷腹', 'body'],
    ['cable-crunch', '绳索卷腹', 'machine'],
    ['machine-crunch', '器械卷腹', 'machine'],
    ['hanging-knee-raise', '悬垂举膝', 'body'],
    ['hanging-leg-raise', '悬垂举腿', 'body'],
    ['reverse-crunch', '反向卷腹', 'body'],
    ['ab-wheel', '健腹轮', 'body'],
  ],
};
const equipment: Record<
  string,
  {
    equipment: string;
    load: ExerciseDefinition['load'];
    weightLabel: string;
    hint: string;
    bodyOnly?: boolean;
  }
> = {
  barbell: {
    equipment: '杠铃',
    load: 'total',
    weightLabel: '含杆 kg',
    hint: '杠铃杆与两侧杠铃片加在一起的重量。',
  },
  dumbbell: {
    equipment: '哑铃',
    load: 'perHand',
    weightLabel: '每只 kg',
    hint: '填一只哑铃的重量；两手同做一次记1次。',
  },
  single: {
    equipment: '哑铃',
    load: 'total',
    weightLabel: '单只 kg',
    hint: '双手握同一只哑铃，填这只哑铃的重量。',
  },
  singleSide: {
    equipment: '哑铃',
    load: 'perHand',
    weightLabel: '单只 kg',
    hint: '填一只哑铃重量、每侧次数；一组包含左右两侧。',
  },
  dumbbellSide: {
    equipment: '哑铃',
    load: 'perHand',
    weightLabel: '每只 kg',
    hint: '填一只哑铃重量，次数填写左右合计；同一口径比较历史。',
  },
  machine: {
    equipment: '器械 / 绳索',
    load: 'total',
    weightLabel: '器械 kg',
    hint: '填器械标示重量；固定同一台器械、同一设置比较。挂片式填两侧片重之和。',
  },
  machineSide: {
    equipment: '器械 / 绳索',
    load: 'total',
    weightLabel: '器械 kg',
    hint: '填器械刻度，次数填左右合计；固定同一器械比较。',
  },
  cablePair: {
    equipment: '器械 / 绳索',
    load: 'perHand',
    weightLabel: '每侧 kg',
    hint: '填一侧配重，两侧同做一次记1次。',
  },
  plate: {
    equipment: '杠铃',
    load: 'total',
    weightLabel: '片重 kg',
    hint: '填添加的杠铃片重量；固定同一器械比较。',
  },
  body: {
    equipment: '自重',
    load: 'bodyweight',
    weightLabel: '自重',
    hint: '只填组数和次数，不把体重加入训练量。',
    bodyOnly: true,
  },
  weighted: {
    equipment: '自重 + 负重',
    load: 'bodyweight',
    weightLabel: '腰带负重 kg',
    hint: '只填腰带或负重背心的重量，不包含体重。',
  },
};
export const resistanceExercises: ExerciseDefinition[] = Object.entries(
  groups,
).flatMap(([group, rows]) =>
  rows.map(([id, name, gear, aliases]) => ({
    id,
    name,
    group,
    ...equipment[gear],
    aliases: aliases ? aliases.split('|') : [],
  })),
);
export function exerciseDefinition(exercise: {
  catalogId?: string;
  name: string;
  load: string;
}) {
  return resistanceExercises.find((e) =>
    exercise.catalogId
      ? e.id === exercise.catalogId
      : e.name === exercise.name && e.load === exercise.load,
  );
}
export const exerciseGroups = Object.keys(groups);
export const cardioTypes = [
  ['outdoor-walk', '户外步行', '步行 / 跑步'],
  ['indoor-walk', '室内步行', '步行 / 跑步'],
  ['outdoor-run', '户外跑步', '步行 / 跑步'],
  ['indoor-run', '室内跑步', '步行 / 跑步'],
  ['hiking', '徒步', '步行 / 跑步'],
  ['indoor-cycle', '室内单车', '器械 / 骑行'],
  ['outdoor-cycle', '户外单车', '器械 / 骑行'],
  ['elliptical', '椭圆机', '器械 / 骑行'],
  ['indoor-row', '室内划船', '器械 / 骑行'],
  ['outdoor-row', '户外划船', '器械 / 骑行'],
  ['stair-stepper', '踏步机', '器械 / 骑行'],
  ['stairs', '爬楼梯', '器械 / 骑行'],
  ['pool-swim', '泳池游泳', '游泳'],
  ['open-water-swim', '开放水域游泳', '游泳'],
  ['water-fitness', '水上健身', '游泳'],
  ['hiit', '高强度间歇训练', '综合 / 球类'],
  ['jump-rope', '跳绳', '综合 / 球类'],
  ['dance', '舞蹈', '综合 / 球类'],
  ['mixed-cardio', '混合有氧', '综合 / 球类'],
  ['boxing', '拳击', '综合 / 球类'],
  ['badminton', '羽毛球', '综合 / 球类'],
  ['basketball', '篮球', '综合 / 球类'],
  ['table-tennis', '乒乓球', '综合 / 球类'],
  ['tennis', '网球', '综合 / 球类'],
  ['football', '足球', '综合 / 球类'],
  ['volleyball', '排球', '综合 / 球类'],
].map(([id, name, group]) => ({ id, name, group }));
