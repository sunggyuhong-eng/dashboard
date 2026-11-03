import { ExternalLink } from 'lucide-react'
import { approvalLink } from './links'

export function ApprovalLink({ url, title }: { url?: string; title: string }) {
  const href = approvalLink(url)
  if (!href) return null
  return <a
    className="approval-shortcut"
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={`${title} 채용승인신청서 열기 (새 탭)`}
    title="채용승인신청서 열기 (새 탭)"
  >바로가기<ExternalLink size={12} aria-hidden="true" /></a>
}
