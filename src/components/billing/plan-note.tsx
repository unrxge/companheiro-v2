'use client'

// A short explanation shown when something belongs to a larger plan. One
// sentence or two and the way to the plans; never a wall of features.

import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { type as typeRoles } from '@/lib/design-tokens'
import { openPlans } from '@/lib/billing/use-plan'

export function PlanNote({
  title, children, onClose, plansLabel = 'See Direction', action,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  plansLabel?: string
  /** Something they can do right here instead (switching project, say). */
  action?: { label: string; onClick: () => void; busy?: boolean }
}) {
  const { t } = useTheme()
  return (
    <ModalDialog
      onClose={onClose}
      title={title}
      maxWidth="480px"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <GhostButton size="sm" onClick={onClose}>{action ? 'Not now' : 'Close'}</GhostButton>
          <GhostButton size="sm" onClick={() => { onClose(); openPlans() }}>{plansLabel}</GhostButton>
          {action && (
            <PrimaryButton size="sm" onClick={action.onClick} loading={action.busy} loadingLabel="Switching…">{action.label}</PrimaryButton>
          )}
        </div>
      }
    >
      <div style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.6, color: t.textSecondary }}>{children}</div>
    </ModalDialog>
  )
}
