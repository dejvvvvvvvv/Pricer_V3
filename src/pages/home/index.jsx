import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/AppIcon';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../../components/ui/Button';

import BackgroundPattern from '../../components/ui/BackgroundPattern';
import Sparkles from '../../components/marketing/Sparkles';
import MotionNumber from '../../components/marketing/MotionNumber';
import LogoMarquee from '../../components/marketing/LogoMarquee';
import SpotlightCard from '../../components/marketing/SpotlightCard';
import ImageRipple from '../../components/marketing/ImageRipple';
import ImageReveal from '../../components/marketing/ImageReveal';
import Accordion from '../../components/marketing/Accordion';
import Reveal from '../../components/marketing/Reveal';

const Home = () => {
  const { t } = useLanguage();

  const trustItems = [
    'PrusaSlicer CLI',
    'White‑label widget',
    'Multi‑tenant',
    'Fees & Markup',
    'Presets (.ini)',
    'Limits (X/Y/Z)',
    'WooCommerce',
    'Shopify',
    'Shoptet',
    'API ready',
  ];

  const steps = [
    {
      icon: 'Upload',
      title: t('home.how.step1.title'),
      desc: t('home.how.step1.desc'),
    },
    {
      icon: 'SlidersHorizontal',
      title: t('home.how.step2.title'),
      desc: t('home.how.step2.desc'),
    },
    {
      icon: 'Clock',
      title: t('home.how.step3.title'),
      desc: t('home.how.step3.desc'),
    },
    {
      icon: 'ShoppingCart',
      title: t('home.how.step4.title'),
      desc: t('home.how.step4.desc'),
    },
  ];

  const features = [
    { icon: 'Scissors', title: t('home.features.slicer.title'), desc: t('home.features.slicer.desc') },
    { icon: 'Calculator', title: t('home.features.pricing.title'), desc: t('home.features.pricing.desc') },
    { icon: 'BadgePercent', title: t('home.features.presets.title'), desc: t('home.features.presets.desc') },
    { icon: 'Palette', title: t('home.features.branding.title'), desc: t('home.features.branding.desc') },
    { icon: 'Ruler', title: t('home.features.limits.title'), desc: t('home.features.limits.desc') },
    { icon: 'ShoppingBag', title: t('home.features.cart.title'), desc: t('home.features.cart.desc') },
  ];

  const faqItems = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
  ];

  return (
    <div className="text-foreground relative">
      <BackgroundPattern />
      {/* HERO */}
      <section className="relative overflow-hidden">

        <div className="mx-auto max-w-6xl px-4 pb-8 pt-14 sm:pt-20">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <Reveal className="lg:col-span-6">
              <div className="relative inline-flex items-center rounded-full border border-border bg-card/60 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {t('home.trust.main')}
                </span>
                <Sparkles className="opacity-40" count={10} />
              </div>

              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
                {t('home.hero.title')}
              </h1>

              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                {t('home.hero.subtitle')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/model-upload">
                    {t('home.hero.cta.primary')}
                  </Link>
                </Button>

                <Button asChild variant="outline" size="lg">
                  <Link to="/pricing">
                    {t('home.hero.cta.secondary')}
                  </Link>
                </Button>

                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="ShieldCheck" size={18} />
                  <span>{t('home.hero.note')}</span>
                </div>
              </div>

              {/* Metrics */}
              <div className="mt-10 grid grid-cols-3 gap-4 sm:max-w-lg">
                <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">
                    <MotionNumber value={3} /> <span className="text-base font-semibold text-muted-foreground">kroky</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">od uploadu k ceně</div>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">
                    <MotionNumber value={14} /> <span className="text-base font-semibold text-muted-foreground">dní</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">zdarma na vyzkoušení</div>
                </div>
                <div className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">
                    <MotionNumber value={100} /> <span className="text-base font-semibold text-muted-foreground">%</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">brandování widgetu</div>
                </div>
              </div>
            </Reveal>

            <Reveal className="lg:col-span-6" delay={0.08}>
              <ImageRipple className="rounded-3xl">
                <div className="relative overflow-hidden rounded-3xl border border-border bg-card/50 shadow-lg backdrop-blur">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />
                  <Sparkles className="opacity-35" count={12} />

                  <div className="relative p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                        <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground">
                        ModelPricer — Live preview
                      </div>
                    </div>

                    <div className="mt-6 grid gap-4">
                      <div className="rounded-2xl border border-border bg-background/60 p-4">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                            <Icon name="Upload" size={20} />
                          </div>
                          <div>
                            <div className="text-sm font-semibold">STL / OBJ / 3MF</div>
                            <div className="text-xs text-muted-foreground">Nahraj model a získej cenu během chvilky</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-2xl border border-border bg-background/60 p-4">
                          <div className="text-xs text-muted-foreground">Materiál</div>
                          <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            PLA / PETG / ABS
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border bg-background/60 p-4">
                          <div className="text-xs text-muted-foreground">Kvalita</div>
                          <div className="mt-1 flex items-center gap-2 text-sm font-semibold">
                            <Icon name="Sparkles" size={16} />
                            Standard / Fine
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-background/60 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-muted-foreground">Odhad (z PrusaSlicer)</div>
                            <div className="mt-1 text-sm font-semibold">2h 14m • 46g</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Cena</div>
                            <div className="mt-1 text-2xl font-bold">299 Kč</div>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-3">
                          <Button size="sm" className="flex-1">
                            <Icon name="ShoppingCart" size={16} className="mr-2" />
                            Add to cart
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1">
                            <Icon name="SlidersHorizontal" size={16} className="mr-2" />
                            Parametry
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </ImageRipple>
            </Reveal>
          </div>
        </div>

        {/* TRUST STRIP */}
        <div className="mx-auto max-w-6xl px-4 py-6">
            <Reveal>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold">
                  {t('home.trust.sub')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('home.trust.main')}
                </div>
              </div>

              <div className="mt-4">
                <LogoMarquee items={trustItems} />
              </div>
            </Reveal>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Reveal>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight">{t('home.how.title')}</h2>
            <p className="mt-3 text-muted-foreground leading-relaxed">{t('home.how.subtitle')}</p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {steps.map((s, idx) => (
            <Reveal key={s.title} delay={idx * 0.05}>
              <SpotlightCard>
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
                    <Icon name={s.icon} size={22} />
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{s.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.desc}</div>
                  </div>
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div>
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight">{t('home.features.title')}</h2>
          </Reveal>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, idx) => (
              <Reveal key={f.title} delay={idx * 0.04}>
                <SpotlightCard>
                  <div className="flex items-start gap-4">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
                      <Icon name={f.icon} size={20} />
                    </div>
                    <div>
                      <div className="font-semibold">{f.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{f.desc}</div>
                    </div>
                  </div>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO PREVIEW */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Reveal>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">{t('home.demo.title')}</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">{t('home.demo.subtitle')}</p>
            </div>
            <Button asChild variant="outline">
              <Link to="/model-upload">
                <Icon name="Play" size={16} className="mr-2" />
                {t('home.demo.cta')}
              </Link>
            </Button>
          </div>
        </Reveal>

        <div className="mt-10">
          <ImageReveal
            className="shadow-lg"
            before={
              <div className="h-full w-full p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10">
                    <Icon name="Mail" size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">E‑mail poptávky</div>
                    <div className="text-xs text-muted-foreground">ruční nacenění, čekání, ztracené leady</div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <div className="h-10 rounded-xl bg-muted" />
                  <div className="h-10 rounded-xl bg-muted/70" />
                  <div className="h-10 rounded-xl bg-muted/50" />
                </div>

                <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  „Můžete mi prosím poslat cenu za 2 kusy?“
                </div>
              </div>
            }
            after={
              <div className="h-full w-full p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
                    <Icon name="Sparkles" size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">Okamžitá cena ve widgetu</div>
                    <div className="text-xs text-muted-foreground">přesné slicování + pravidla cen</div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Čas tisku</div>
                    <div className="mt-1 text-lg font-semibold">2h 14m</div>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-xs text-muted-foreground">Hmotnost</div>
                    <div className="mt-1 text-lg font-semibold">46 g</div>
                  </div>
                  <div className="sm:col-span-2 rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Cena</div>
                      <div className="mt-1 text-2xl font-bold">299 Kč</div>
                    </div>
                    <Button size="sm">
                      <Icon name="ShoppingCart" size={16} className="mr-2" />
                      Add to cart
                    </Button>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </section>

      {/* PRICING TEASER */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div>
          <div className="rounded-3xl border border-border bg-card/50 p-8 shadow-lg backdrop-blur">
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <Reveal className="lg:col-span-7">
                <h2 className="text-3xl font-bold tracking-tight">{t('home.pricing.title')}</h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">{t('home.pricing.subtitle')}</p>
              </Reveal>
              <Reveal className="lg:col-span-5 lg:justify-self-end" delay={0.08}>
                <Button asChild size="lg">
                  <Link to="/pricing">
                    {t('home.pricing.cta')}
                  </Link>
                </Button>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* FOR WHOM */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">{t('home.audience.title')}</h2>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Reveal delay={0.02}>
            <SpotlightCard>
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
                  <Icon name="Store" size={20} />
                </div>
                <div>
                  <div className="font-semibold">{t('home.audience.shops.title')}</div>
                  <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('home.audience.shops.desc')}</div>
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={0.06}>
            <SpotlightCard>
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
                  <Icon name="Factory" size={20} />
                </div>
                <div>
                  <div className="font-semibold">{t('home.audience.studios.title')}</div>
                  <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('home.audience.studios.desc')}</div>
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
          <Reveal delay={0.1}>
            <SpotlightCard>
              <div className="flex items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10">
                  <Icon name="Printer" size={20} />
                </div>
                <div>
                  <div className="font-semibold">{t('home.audience.printers.title')}</div>
                  <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{t('home.audience.printers.desc')}</div>
                </div>
              </div>
            </SpotlightCard>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div>
          <Reveal>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold tracking-tight">FAQ</h2>
                <p className="mt-3 text-muted-foreground leading-relaxed">{t('home.faq.more')}</p>
              </div>
              <Button asChild variant="outline">
                <Link to="/support">
                  <Icon name="LifeBuoy" size={16} className="mr-2" />
                  Support
                </Link>
              </Button>
            </div>
          </Reveal>

          <div className="mt-10">
            <Accordion items={faqItems} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
