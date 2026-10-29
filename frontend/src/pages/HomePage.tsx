import { SectionWave } from '../components/SectionWave'
import { HeroSection } from '../sections/HeroSection'
import { AboutSection } from '../sections/AboutSection'
import { PictureSection } from '../sections/PictureSection'
import { ServicesSection } from '../sections/ServicesSection'
import { LawyersSection } from '../sections/LawyersSection'
import { CtaBand } from '../sections/CtaBand'
import { useSeo } from '../utils/seo'
import '../sections/home.css'

export function HomePage() {
  useSeo('home', '/')
  return (
    <>
      <HeroSection />
      {/* hero↔about seam: the hero's own masked wave edge — no element */}
      <AboutSection />
      <SectionWave from="white" to="navy" flip />
      <PictureSection />
      <SectionWave from="navy" to="gray" />
      <ServicesSection />
      <SectionWave from="gray" to="navy" flip />
      <LawyersSection />
      <SectionWave from="navy" to="white" />
      <CtaBand />
      <SectionWave from="white" to="goldwhite" flip />
    </>
  )
}
