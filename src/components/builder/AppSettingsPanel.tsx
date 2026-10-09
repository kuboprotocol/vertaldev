import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, Image, Info, Wand2, LayoutTemplate } from 'lucide-react'
import AppLogoManager from './AppLogoManager'
import AILogoGenerator from './AILogoGenerator'
import NavbarCustomizer from './NavbarCustomizer'
import { Button } from '@/components/ui/button'

interface AppSettingsPanelProps {
  appId: string
  appName?: string
}

export default function AppSettingsPanel({ appId, appName = 'Seu App' }: AppSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<'ai-generator' | 'logos' | 'navbar' | 'branding' | 'advanced'>('ai-generator')

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold font-display">Configurações de {appName}</h1>
              <p className="text-muted-foreground">Gerenciar logos, branding e configurações avançadas</p>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 border-b border-border overflow-x-auto">
          {[
            { id: 'ai-generator', label: 'IA Generator', icon: Wand2 },
            { id: 'logos', label: 'Logos', icon: Image },
            { id: 'navbar', label: 'Navbar', icon: LayoutTemplate },
            { id: 'branding', label: 'Branding', icon: Settings },
            { id: 'advanced', label: 'Avançado', icon: Info },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'ai-generator' && (
            <div className="space-y-6">
              <AILogoGenerator appId={appId} />
            </div>
          )}

          {activeTab === 'logos' && (
            <div className="space-y-6">
              <AppLogoManager appId={appId} />

              <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
                <h3 className="font-bold mb-2">💡 Dicas de Logo</h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li>• <strong>PNG:</strong> Melhor para transparência (ideal para favicon)</li>
                  <li>• <strong>SVG:</strong> Escalável sem perder qualidade (recomendado)</li>
                  <li>• <strong>WebP:</strong> Compressão otimizada para web</li>
                  <li>• <strong>JPG:</strong> Ideal para fotografias e imagens complexas</li>
                  <li>• Tamanho máximo: 5MB por arquivo</li>
                  <li>• Defina um logo como "Principal" para ser usado em favicons e metadados</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'navbar' && (
            <NavbarCustomizer appId={appId} appName={appName} />
          )}

          {activeTab === 'branding' && (
            <div className="space-y-6">
              <div className="bg-card/50 backdrop-blur border border-border rounded-xl p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Cor Primária</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      defaultValue="#3b82f6"
                      className="h-10 w-20 rounded-lg cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground">#3b82f6</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Cor Secundária</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      defaultValue="#8b5cf6"
                      className="h-10 w-20 rounded-lg cursor-pointer"
                    />
                    <span className="text-sm text-muted-foreground">#8b5cf6</span>
                  </div>
                </div>

                <Button className="w-full">Salvar Cores</Button>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div className="bg-card/50 backdrop-blur border border-border rounded-xl p-6">
                <h3 className="font-bold mb-4">Configurações Avançadas</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Custom Domain</label>
                    <input
                      type="text"
                      placeholder="seu-app.com"
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">API Key</label>
                    <input
                      type="password"
                      placeholder="sk_live_..."
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg font-mono text-xs"
                    />
                  </div>

                  <Button className="w-full">Atualizar Configurações</Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
