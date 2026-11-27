import { Reveal, Section, SectionHeading } from './landingUi'

const steps = [
  {
    number: '1',
    title: 'Describe your idea',
    description: 'Write what the app should do. You can add colors, pages, or a screenshot as a reference.',
  },
  {
    number: '2',
    title: 'Make changes in a chat',
    description: 'Ask for changes in plain words. For example: add a page, change a color, or move a button.',
  },
  {
    number: '3',
    title: 'Publish',
    description: 'Publish with one click. You get a link to share. You can also use your own domain or export the code.',
  },
]

export default function HowItWorksSection() {
  return (
    <Section labelledBy="how-title" className="border-t border-white/[0.06]">
      <SectionHeading id="how-title" eyebrow="How it works" title="From idea to app in three steps.">
        You talk to the AI the way you would talk to a developer.
      </SectionHeading>

      <ol className="mt-16 grid gap-12 md:mt-20 md:grid-cols-3 md:gap-10">
        {steps.map((step, i) => (
          <Reveal as="li" key={step.number} delay={i * 0.08} className="text-center md:text-left">
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-sm font-medium text-foreground/80"
              >
                {step.number}
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.01em] text-foreground">{step.title}</h3>
              <p className="mt-2 text-[17px] leading-relaxed text-muted-foreground">{step.description}</p>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}
