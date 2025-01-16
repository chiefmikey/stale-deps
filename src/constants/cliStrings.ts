export const CLI_STRINGS = {
  PROGRESS_FORMAT:
    'Analyzing dependencies |{bar}| {currentFiles}/{totalFiles} Files | {currentDeps}/{totalDeps} Dependencies | {percentage}%',
  BAR_COMPLETE: '\u2588',
  BAR_INCOMPLETE: '\u2591',
  CLI_NAME: 'depsweep',
  CLI_DESCRIPTION:
    'Automated intelligent dependency cleanup and impact analysis report',
  EXAMPLE_TEXT: '\nExample:\n  $ depsweep -v --measure-impact',
} as const;
