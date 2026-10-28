import { SectionDivider } from '../components/SectionDivider'
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
      <SectionDivider />
      <AboutSection />
      <SectionDivider />
      <PictureSection />
      <SectionDivider />
      <ServicesSection />
      <SectionDivider />
      <LawyersSection />
      <SectionDivider />
      <CtaBand />
    </>
  )
}
