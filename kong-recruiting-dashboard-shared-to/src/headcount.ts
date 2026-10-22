import type { Opening } from './types'

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

export function projectName(opening: Opening) {
  const saved = opening.project.trim()
  const name = saved || opening.title.match(/^\[([^\]]+)\]/)?.[1]?.trim() || ''
  const project = name.replace(/^Project\s+/i, '').trim()
  return /^(octopus|otps)$/i.test(project) ? 'OTPS' : project || '프로젝트 미지정'
}

// Shared headcount changes neither posting IDs nor candidate ownership.
export type ToGroup = {
  key: string
  name: string
  shared: boolean
  openings: Opening[]
  targetTo: number
  hiredCount: number
  reasons: string[]
}

export function groupOpeningsByProject(openings: Opening[]): Map<string, Opening[]> {
  const groups = new Map<string, { name: string; openings: Opening[] }>()
  openings.forEach(opening => {
    const name = projectName(opening)
    const key = normalized(name)
    const group = groups.get(key) || { name, openings: [] }
    group.openings.push(opening)
    groups.set(key, group)
  })
  return new Map([...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')).map(group => [group.name, group.openings]))
}

export function groupOpeningsByTo(openings: Opening[]): ToGroup[] {
  const groups = new Map<string, ToGroup>()
  openings.forEach(opening => {
    const name = (opening.toGroup || '').trim().replace(/\s+/g, ' ')
    const key = name
      ? JSON.stringify(['group', normalized(projectName(opening)), normalized(name)])
      : JSON.stringify(['opening', opening.id])
    const group = groups.get(key) || { key, name, shared: !!name, openings: [], targetTo: 0, hiredCount: 0, reasons: [] }
    const target = Math.max(0, opening.targetTo || 0)
    // Accept a legacy 3/0 entry as one pool of 3. Conflicting positive values
    // must be corrected rather than silently summed or resolved by row order.
    if (group.shared && group.targetTo > 0 && target > 0 && group.targetTo !== target) {
      throw new Error(`${projectName(opening)} / ${name}의 채용인원이 서로 다릅니다. 같은 TO 그룹에는 동일한 전체 채용인원을 입력해 주세요.`)
    }
    group.targetTo = Math.max(group.targetTo, target)
    group.hiredCount += Math.max(0, opening.hiredCount || 0)
    group.openings.push(opening)
    const reason = opening.reason.trim()
    if (reason && !group.reasons.some(value => normalized(value) === normalized(reason))) group.reasons.push(reason)
    groups.set(key, group)
  })
  return [...groups.values()].map(group => ({
    ...group, openings: [...group.openings].sort((a, b) => a.title.localeCompare(b.title, 'ko')),
  })).sort((a, b) => a.openings[0].title.localeCompare(b.openings[0].title, 'ko'))
}

export function totalTargetTo(openings: Opening[]): number {
  return groupOpeningsByTo(openings).reduce((sum, group) => sum + group.targetTo, 0)
}
