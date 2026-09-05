export const AUDIO_ASSETS = {
  music: [
    { id: 'epic-march', title: '瘟疫行军', sourceTitle: 'Epic March Loop', url: `${import.meta.env?.BASE_URL || './'}audio/music/epic-march.ogg`, gain: 1.35 },
    { id: 'dark-shrine', title: '幽暗圣殿', sourceTitle: 'Dark Shrine Loop', url: `${import.meta.env?.BASE_URL || './'}audio/music/dark-shrine.ogg`, gain: 1.35 },
  ],
  sfx: Object.fromEntries([
    'swing-1','swing-2','swing-3','hit-1','hit-2','heavy','hurt','kill',
    'zombie-1','zombie-2','zombie-3','brute-1','brute-2','footstep-1','footstep-2',
    'holy-charge','whirl','consecrate','chime','victory',
  ].map(key => [key,{url:`${import.meta.env?.BASE_URL || './'}audio/sfx/${key}.ogg`}])),
};
AUDIO_ASSETS.sfx.dodge = { url: `${import.meta.env?.BASE_URL || './'}audio/sfx/swing-3.ogg`, gain: .9 };
