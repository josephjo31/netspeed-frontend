import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TestCards from "@/components/TestCards";
import Features from "@/components/Features";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#090B10]">
      <Navbar />
      <Hero />
      <TestCards />
      <Features />
      <Footer />
    </main>
  );
}
