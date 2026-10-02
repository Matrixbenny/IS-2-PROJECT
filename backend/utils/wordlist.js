// Small diceware-style word list for generating memorable, multi-word Access Keys
// (decision #21). Not cryptographically exhaustive - combined with crypto-random
// selection across 200 words, 4 words gives ~200^4 (~1.6 billion) combinations,
// which is adequate entropy for a capability secret paired with a tracking reference.
module.exports = [
  'purple', 'tiger', 'lemon', 'forest', 'river', 'stone', 'cloud', 'eagle', 'maple', 'copper',
  'silver', 'golden', 'quiet', 'swift', 'bold', 'gentle', 'brave', 'clever', 'bright', 'calm',
  'desert', 'island', 'meadow', 'canyon', 'valley', 'summit', 'harbor', 'bridge', 'castle', 'garden',
  'amber', 'coral', 'jade', 'onyx', 'pearl', 'ruby', 'topaz', 'violet', 'indigo', 'scarlet',
  'falcon', 'otter', 'badger', 'heron', 'lynx', 'raven', 'sparrow', 'panther', 'zebra', 'gazelle',
  'mango', 'papaya', 'guava', 'baobab', 'acacia', 'cedar', 'willow', 'birch', 'walnut', 'cherry',
  'thunder', 'breeze', 'frost', 'ember', 'shadow', 'dawn', 'dusk', 'horizon', 'comet', 'nebula',
  'cobalt', 'crimson', 'ivory', 'slate', 'bronze', 'platinum', 'crystal', 'marble', 'granite', 'basalt',
  'whisper', 'echo', 'ripple', 'drift', 'glow', 'spark', 'flicker', 'gleam', 'shimmer', 'blaze',
  'anchor', 'compass', 'lantern', 'beacon', 'voyage', 'journey', 'horizon', 'summit', 'trail', 'path',
  'kestrel', 'impala', 'cheetah', 'leopard', 'buffalo', 'rhino', 'elephant', 'giraffe', 'hippo', 'crane',
  'turquoise', 'emerald', 'sapphire', 'quartz', 'obsidian', 'alabaster', 'mahogany', 'ebony', 'sandalwood', 'bamboo',
  'orbit', 'galaxy', 'meteor', 'eclipse', 'zenith', 'equinox', 'solstice', 'tide', 'current', 'monsoon',
  'savanna', 'plateau', 'delta', 'lagoon', 'oasis', 'ridge', 'cliff', 'glacier', 'tundra', 'prairie',
  'velvet', 'linen', 'cotton', 'satin', 'woven', 'stitched', 'folded', 'layered', 'polished', 'carved',
  'lively', 'steady', 'nimble', 'patient', 'honest', 'loyal', 'humble', 'earnest', 'diligent', 'resolute',
  'maple', 'pine', 'spruce', 'juniper', 'fern', 'moss', 'clover', 'thistle', 'heather', 'lavender',
  'copper', 'tin', 'iron', 'steel', 'zinc', 'nickel', 'chrome', 'brass', 'pewter', 'flint',
  'harvest', 'planting', 'morning', 'evening', 'midnight', 'noonday', 'daylight', 'starlight', 'moonlight', 'sunrise',
  'wanderer', 'traveler', 'explorer', 'pioneer', 'settler', 'builder', 'farmer', 'fisher', 'herder', 'weaver'
];
