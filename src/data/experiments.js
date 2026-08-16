export const GRADES = [
  {
    grade: 'grade8a',
    label: '八年级 上册',
    chapters: [
      {
        id: 'ch1',
        title: '机械运动',
        experiments: [
          { id: 'e-motion-desc', title: '运动的描述（参照物）', slug: 'motion-description', type: '探究', level: '基础' },
          { id: 'e-velocity', title: '探究匀速与变速运动', slug: 'uniform-motion', type: '探究', level: '核心' },
          { id: 'e-speed', title: '测量平均速度', slug: 'average-speed', type: '测量', level: '基础' }
        ]
      },
      {
        id: 'ch2',
        title: '声现象',
        experiments: [
          { id: 'e-sound', title: '探究声音的产生与传播', slug: 'sound-propagation', type: '探究', level: '基础' },
          { id: 'e-sound-tone', title: '探究声音的特性（音调·响度·音色）', slug: 'sound-properties', type: '探究', level: '核心' },
          { id: 'e-sound-noise', title: '回声测距与噪声的控制', slug: 'noise-echo', type: '探究', level: '基础' }
        ]
      },
      {
        id: 'ch3',
        title: '物态变化',
        experiments: [
          { id: 'e-temp', title: '用温度计测量水的温度', slug: 'thermometer-temperature', type: '测量', level: '基础' },
          { id: 'e-melt', title: '探究固体熔化时的温度变化规律', slug: 'melting-temperature', type: '探究', level: '基础' },
          { id: 'e-boil', title: '探究水沸腾时温度变化的特点', slug: 'water-boiling', type: '探究', level: '基础' },
          { id: 'e-sublimate', title: '观察碘的升华和凝华', slug: 'iodine-sublimation', type: '观察', level: '基础' }
        ]
      },
      {
        id: 'ch4',
        title: '光现象',
        experiments: [
          { id: 'e-light', title: '探究光的反射定律', slug: 'light-reflection', type: '探究', level: '基础' },
          { id: 'e-mirror', title: '探究平面镜成像的特点', slug: 'plane-mirror', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch5',
        title: '透镜及其应用',
        experiments: [
          { id: 'e-lens-camera', title: '探究凸透镜的成像规律', slug: 'lens-imaging', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch6',
        title: '质量与密度',
        experiments: [
          { id: 'e-density', title: '测量固体和液体的密度', slug: 'density-measurement', type: '测量', level: '核心' }
        ]
      }
    ]
  },
  {
    grade: 'grade8b',
    label: '八年级 下册',
    chapters: [
      {
        id: 'ch7',
        title: '力',
        experiments: [
          { id: 'e-force', title: '探究弹簧测力计的测量原理', slug: 'spring-dynamometer', type: '探究', level: '基础' }
        ]
      },
      {
        id: 'ch8',
        title: '运动和力',
        experiments: [
          { id: 'e-friction', title: '探究影响滑动摩擦力大小的因素', slug: 'sliding-friction', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch9',
        title: '压强',
        experiments: [
          { id: 'e-pressure', title: '探究液体内部压强的规律', slug: 'liquid-pressure', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch10',
        title: '浮力',
        experiments: [
          { id: 'e-buoyancy', title: '探究浮力大小的影响因素', slug: 'buoyancy', type: '探究', level: '核心' }
        ]
      }
    ]
  },
  {
    grade: 'grade9',
    label: '九年级 全册',
    chapters: [
      {
        id: 'ch11',
        title: '电流和电路',
        experiments: [
          { id: 'e-circuit', title: '探究串并联电路的电流规律', slug: 'series-parallel-current', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch12',
        title: '电压 电阻',
        experiments: [
          { id: 'e-resistance', title: '探究影响电阻大小的因素', slug: 'resistance-factors', type: '探究', level: '基础' }
        ]
      },
      {
        id: 'ch13',
        title: '欧姆定律',
        experiments: [
          { id: 'e-ohm', title: '探究电流与电压和电阻的关系', slug: 'ohms-law', type: '探究', level: '核心' }
        ]
      },
      {
        id: 'ch14',
        title: '电功率',
        experiments: [
          { id: 'e-power', title: '测量小灯泡的电功率', slug: 'lamp-power', type: '测量', level: '核心' }
        ]
      },
      {
        id: 'ch15',
        title: '电与磁',
        experiments: [
          { id: 'e-magnet', title: '探究电磁铁磁性强弱的影响因素', slug: 'electromagnet-strength', type: '探究', level: '核心' },
          { id: 'e-coil-rotation', title: '通电线圈在磁场中的转动', slug: 'coil-rotation', type: '观察', level: '核心' }
        ]
      }
    ]
  }
]

export function findExperiment(id) {
  for (const g of GRADES) {
    for (const c of g.chapters) {
      const exp = c.experiments.find((e) => e.id === id)
      if (exp) return { exp, chapter: c, grade: g }
    }
  }
  return null
}

export function findBySlug(slug) {
  for (const g of GRADES) {
    for (const c of g.chapters) {
      const exp = c.experiments.find((e) => e.slug === slug)
      if (exp) return { exp, chapter: c, grade: g }
    }
  }
  return null
}

export function findExpId(slugOrId) {
  return findBySlug(slugOrId)?.exp.id || (findExperiment(slugOrId) ? slugOrId : null)
}