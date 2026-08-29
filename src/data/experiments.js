export const SUBJECTS = [
  { id: 'physics', label: '物理' },
  { id: 'math', label: '数学' }
]

export const GRADES = [
  {
    grade: 'grade8a',
    subject: 'physics',
    label: '八年级 上册',
    experiments: [
      { id: 'e-motion-desc', title: '运动的描述（参照物）', slug: 'motion-description', type: '探究', level: '基础' },
      { id: 'e-velocity', title: '探究匀速与变速运动', slug: 'uniform-motion', type: '探究', level: '核心' },
      { id: 'e-speed', title: '测量平均速度', slug: 'average-speed', type: '测量', level: '基础' },
      { id: 'e-sound', title: '探究声音的产生与传播', slug: 'sound-propagation', type: '探究', level: '基础' },
      { id: 'e-sound-tone', title: '探究声音的特性（音调·响度·音色）', slug: 'sound-properties', type: '探究', level: '核心' },
      { id: 'e-sound-noise', title: '回声测距与噪声的控制', slug: 'noise-echo', type: '探究', level: '基础' },
      { id: 'e-temp', title: '用温度计测量水的温度', slug: 'thermometer-temperature', type: '测量', level: '基础' },
      { id: 'e-melt', title: '探究固体熔化时的温度变化规律', slug: 'melting-temperature', type: '探究', level: '基础' },
      { id: 'e-boil', title: '探究水沸腾时温度变化的特点', slug: 'water-boiling', type: '探究', level: '基础' },
      { id: 'e-sublimate', title: '观察碘的升华和凝华', slug: 'iodine-sublimation', type: '观察', level: '基础' },
      { id: 'e-light', title: '探究光的反射定律', slug: 'light-reflection', type: '探究', level: '基础' },
      { id: 'e-mirror', title: '探究平面镜成像的特点', slug: 'plane-mirror', type: '探究', level: '核心' },
      { id: 'e-lens-camera', title: '探究凸透镜的成像规律', slug: 'lens-imaging', type: '探究', level: '核心' },
      { id: 'e-density', title: '测量固体和液体的密度', slug: 'density-measurement', type: '测量', level: '核心' }
    ]
  },
  {
    grade: 'grade8b',
    subject: 'physics',
    label: '八年级 下册',
    experiments: [
      { id: 'e-force', title: '探究重力的大小跟质量的关系', slug: 'spring-dynamometer', type: '探究', level: '基础' },
      { id: 'e-friction', title: '探究影响滑动摩擦力大小的因素', slug: 'sliding-friction', type: '探究', level: '核心' },
      { id: 'e-pressure', title: '探究液体内部压强的规律', slug: 'liquid-pressure', type: '探究', level: '核心' },
      { id: 'e-buoyancy', title: '探究浮力大小的影响因素', slug: 'buoyancy', type: '探究', level: '核心' },
      { id: 'e-lever', title: '探究杠杆的平衡条件', slug: 'lever-balance', type: '探究', level: '核心' },
      { id: 'e-pulley', title: '研究定滑轮和动滑轮的特点', slug: 'pulley-characteristics', type: '探究', level: '核心' },
      { id: 'e-pulley-sandbox', title: '滑轮组装沙盒与机械效率', slug: 'pulley-sandbox', type: '探究', level: '进阶' }
    ]
  },
  {
    grade: 'math8',
    subject: 'math',
    label: '八年级',
    experiments: [
      { id: 'e-geometry-transform', title: '探究平移、旋转与轴对称', slug: 'geometry-transformations', type: '探究', level: '核心' }
    ]
  },
  {
    grade: 'grade9',
    subject: 'physics',
    label: '九年级 全册',
    experiments: [
      { id: 'e-circuit', title: '探究串并联电路的电流规律', slug: 'series-parallel-current', type: '探究', level: '核心' },
      { id: 'e-resistance', title: '探究影响电阻大小的因素', slug: 'resistance-factors', type: '探究', level: '基础' },
      { id: 'e-ohm', title: '探究电流与电压和电阻的关系', slug: 'ohms-law', type: '探究', level: '核心' },
      { id: 'e-power', title: '测量小灯泡的电功率', slug: 'lamp-power', type: '测量', level: '核心' },
      { id: 'e-magnet', title: '探究电磁铁磁性强弱的影响因素', slug: 'electromagnet-strength', type: '探究', level: '核心' },
      { id: 'e-coil-rotation', title: '通电线圈在磁场中的转动', slug: 'coil-rotation', type: '观察', level: '核心' }
    ]
  }
]

export function gradesBySubject(subject) {
  return GRADES.filter((g) => (g.subject || 'physics') === subject)
}

export function subjectOfGrade(gradeId) {
  return GRADES.find((g) => g.grade === gradeId)?.subject || 'physics'
}

export function findExperiment(id) {
  for (const g of GRADES) {
    const exp = g.experiments.find((e) => e.id === id)
    if (exp) return { exp, grade: g }
  }
  return null
}

export function findBySlug(slug) {
  for (const g of GRADES) {
    const exp = g.experiments.find((e) => e.slug === slug)
    if (exp) return { exp, grade: g }
  }
  return null
}

export function findExpId(slugOrId) {
  return findBySlug(slugOrId)?.exp.id || (findExperiment(slugOrId) ? slugOrId : null)
}