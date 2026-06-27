export interface ExistingArtifactSummary {
  id: string
  type: string
  title: string
  createdByAgentId: string
}

export function renderExistingArtifactsContext(artifacts: readonly ExistingArtifactSummary[]): string {
  const rows = artifacts
    .map(
      (artifact) =>
        `  <artifact id=${xmlAttr(artifact.id)} type=${xmlAttr(artifact.type)} title=${xmlAttr(
          artifact.title,
        )} createdByAgentId=${xmlAttr(artifact.createdByAgentId)} />`,
    )
    .join('\n')

  return [
    '<existing_artifacts>',
    rows || '  (none)',
    '</existing_artifacts>',
    '',
    'Use these exact artifact ids when the user refers to existing PRD, design, or other artifacts.',
    'Before planning dependent work, call read_artifact with the matching artifactId to inspect the full content.',
    'Do not guess artifact ids such as art_0, art_1, art_PRD, or art_design.',
  ].join('\n')
}

function xmlAttr(s: string): string {
  return `"${s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`
}
