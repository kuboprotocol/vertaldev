import { Gift, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function CreditsPromoSection() {
  const navigate = useNavigate()

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="py-20 px-6 relative overflow-hidden"
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 opacity-50" />
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-30" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl opacity-30" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/5">
            <Zap className="h-3 w-3 mr-1" /> Bônus de Boas-vindas
          </Badge>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-6">
            Comece com
            <span className="block bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              50 Créditos Grátis
            </span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Crie, implante e escale seus aplicativos sem limites. Mais bônus ao indicar amigos!
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Boas-vindas */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
            <div className="relative bg-card/50 backdrop-blur border border-primary/20 rounded-2xl p-8 hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold font-display">50 Créditos</h3>
                  <p className="text-sm text-muted-foreground">Ao se cadastrar</p>
                </div>
                <div className="p-4 bg-primary/10 rounded-xl">
                  <Gift className="h-6 w-6 text-primary" />
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Créditos para IA</p>
                    <p className="text-xs text-muted-foreground">Use para gerar código e conteúdo</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Deploys inclusos</p>
                    <p className="text-xs text-muted-foreground">Coloque seus apps no ar imediatamente</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Sem cartão de crédito</p>
                    <p className="text-xs text-muted-foreground">Comece agora, pague depois se quiser</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => navigate('/auth')}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Começar Grátis
              </Button>
            </div>
          </motion.div>

          {/* Programa de Afiliados */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-0 group-hover:opacity-100" />
            <div className="relative bg-card/50 backdrop-blur border border-primary/20 rounded-2xl p-8 hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold font-display">5% de Bônus</h3>
                  <p className="text-sm text-muted-foreground">Ao indicar amigos</p>
                </div>
                <div className="p-4 bg-primary/10 rounded-xl">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Ganhe 5% vitalício</p>
                    <p className="text-xs text-muted-foreground">De cada amigo que indicar e pagar</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Sem limite de ganhos</p>
                    <p className="text-xs text-muted-foreground">Quanto mais indica, mais ganha</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Pague em conta ou créditos</p>
                    <p className="text-xs text-muted-foreground">Use seus ganhos ou saque via PIX</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => navigate('/affiliate')}
                variant="outline"
                className="w-full border-primary/30 hover:bg-primary/10"
              >
                Ver Programa de Afiliados
              </Button>
            </div>
          </motion.div>
        </div>

        {/* Stats */}
        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {[
            { label: 'Créditos Distribuídos', value: '10M+' },
            { label: 'Usuários Ativos', value: '50K+' },
            { label: 'Apps Deployados', value: '100K+' },
          ].map((stat, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
              className="text-center"
            >
              <p className="text-3xl font-display font-bold text-primary">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}
