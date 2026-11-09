import type { Opening, ProjectTableSlot } from './types'

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

export function toProgressAnchor(group: ToGroup): string {
  return `to-progress-${group.openings[0].id}`
}

export function activeToTargets(openings: Opening[]): Map<number, string | null> {
  const targets = new Map<number, string | null>()
  groupOpeningsByTo(openings.filter(opening => opening.status === '진행중')).forEach(group => {
    const anchor = toProgressAnchor(group)
    group.openings.forEach(opening => {
      const number = opening.toNumber
      if (!number) return
      if (targets.has(number) && targets.get(number) !== anchor) targets.set(number, null)
      else if (!targets.has(number)) targets.set(number, anchor)
    })
  })
  return targets
}

export function targetForProjectSlot(slot: ProjectTableSlot, targets: Map<number, string | null>): string | null {
  const numbers = slot.toNumbers?.length ? slot.toNumbers : slot.toNumber ? [slot.toNumber] : []
  if (!numbers.length) return null
  const destinations = numbers.map(number => targets.get(number))
  const active = [...new Set(destinations.filter((destination): destination is string => typeof destination === 'string'))]
  return destinations.includes(null) || active.length !== 1 ? null : active[0]
}
