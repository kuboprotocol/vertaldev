import { motion } from 'framer-motion'
import { X, Type, Shapes, Image, Grid3X3 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CanvasInfoPanelProps {
  onClose: () => void
}

const features = [
  { icon: Type, label: 'Rich text with custom fonts' },
  { icon: Shapes, label: 'Shapes and smart connectors' },
  { icon: Image, label: 'Upload images and icons' },
  { icon: Grid3X3, label: 'Grid and snapping' },
]

const shortcuts = [
  { key: 'Ctrl+S', action: 'Save' },
  { key: 'Ctrl+A', action: 'Select all' },
  { key: 'Ctrl+0', action: 'Zoom to fit' },
  { key: 'Ctrl+Shift+E', action: 'Export PNG' },
]

export default function CanvasInfoPanel({ onClose }: CanvasInfoPanelProps) {
  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="absolute top-4 right-4 z-10 w-72 rounded-2xl border border-white/[0.06] bg-card/90 p-5 shadow-lg backdrop-blur-xl"
    >
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-[15px] font-semibold text-foreground">Infinite canvas</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="space-y-2.5 mb-5">
        {features.map((feat, i) => {
          const Icon = feat.icon
          return (
            <div key={i} className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span>{feat.label}</span>
            </div>
          )
        })}
      </div>

      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Keyboard shortcuts</p>
        <div className="space-y-1.5">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <kbd className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono text-[10px]">
                {s.key}
              </kbd>
              <span className="text-muted-foreground">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
