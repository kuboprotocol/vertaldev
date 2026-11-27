import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Section, SectionHeading, focusRing } from './landingUi'

const faqs = [
  {
    q: 'What is Vertal Dev?',
    a: 'Vertal Dev is a platform where you create apps, websites, online stores, and tools with AI. You describe what you want, and the AI writes the code. You do not need to know how to code.',
  },
  {
    q: 'Does it work for my type of business?',
    a: 'Yes. It works for restaurants, consulting firms, online stores, and many other types of business. You describe your business, and the app follows your needs.',
  },
  {
    q: 'What if I do not know exactly what I want?',
    a: 'Describe your idea in a few words. The AI suggests designs, pages, and features to help you start.',
  },
  {
    q: 'Can I change what the AI creates?',
    a: 'Yes. You can change the text, images, colors, layout, and pages. Ask for each change in the chat.',
  },
  {
    q: 'How much does it cost?',
    a: 'You can start for free. You get 5 free credits when you create an account. Paid plans start at US$4.99 per month. See the pricing page for all plans.',
  },
  {
    q: 'What does the free plan include?',
    a: 'The free plan includes credits to create and change your projects, and access to templates.',
  },
]

export default function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  const baseId = useId()

  return (
    <Section labelledBy="faq-title" className="border-t border-white/[0.06]">
      <SectionHeading id="faq-title" title="Questions and answers" />

      <ul className="mx-auto mt-14 max-w-2xl divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {faqs.map((faq, index) => {
          const isOpen = open === index
          const panelId = `${baseId}-panel-${index}`
          const buttonId = `${baseId}-button-${index}`
          return (
            <li key={faq.q}>
              <h3>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : index)}
                  className={cn(
                    'flex w-full items-center justify-between gap-6 rounded-sm py-5 text-left text-[17px] font-medium text-foreground',
                    focusRing,
                  )}
                >
                  {faq.q}
                  <Plus
                    aria-hidden
                    className={cn(
                      'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
                      isOpen && 'rotate-45',
                    )}
                  />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="pb-6 pr-10 text-[17px] leading-relaxed text-muted-foreground">{faq.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}
