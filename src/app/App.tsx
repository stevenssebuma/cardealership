import { useState } from "react";
import {
  Menu,
  X,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Search,
  Calendar,
  Shield,
  Award,
  Wrench,
  FileText,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "./components/ui/tabs";

function formatUGX(amount: number) {
  if (amount >= 1_000_000_000)
    return `UGX ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)
    return `UGX ${(amount / 1_000_000).toFixed(0)}M`;
  return `UGX ${amount.toLocaleString()}`;
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<
    number | null
  >(null);

  const vehicles = [
    {
      id: 1,
      name: "Land Cruiser V8",
      brand: "Toyota",
      type: "Luxury SUV",
      year: 2023,
      price: 285_000_000,
      image:
        "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800&q=80",
      specs: {
        power: "309 HP",
        engine: "4.5L V8",
        drive: "4WD",
      },
      category: "luxury",
    },
    {
      id: 2,
      name: "S-Class S500",
      brand: "Mercedes-Benz",
      type: "Luxury Sedan",
      year: 2023,
      price: 360_000_000,
      image:
        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&q=80",
      specs: {
        power: "429 HP",
        engine: "3.0L V6T",
        drive: "RWD",
      },
      category: "luxury",
    },
    {
      id: 3,
      name: "Range Rover Sport",
      brand: "Land Rover",
      type: "Sport Luxury SUV",
      year: 2023,
      price: 420_000_000,
      image:
        "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&q=80",
      specs: {
        power: "395 HP",
        engine: "3.0L I6T",
        drive: "AWD",
      },
      category: "sport",
    },
    {
      id: 4,
      name: "X5 xDrive40i",
      brand: "BMW",
      type: "Sports SUV",
      year: 2023,
      price: 195_000_000,
      image:
        "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&q=80",
      specs: {
        power: "335 HP",
        engine: "3.0L I6T",
        drive: "AWD",
      },
      category: "sport",
    },
    {
      id: 5,
      name: "Land Cruiser Prado TZ",
      brand: "Toyota",
      type: "Premium SUV",
      year: 2022,
      price: 168_000_000,
      image:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80",
      specs: {
        power: "177 HP",
        engine: "2.8L Diesel",
        drive: "4WD",
      },
      category: "luxury",
    },
    {
      id: 6,
      name: "LX 570",
      brand: "Lexus",
      type: "Ultra Luxury SUV",
      year: 2023,
      price: 390_000_000,
      image:
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=800&q=80",
      specs: {
        power: "383 HP",
        engine: "5.7L V8",
        drive: "4WD",
      },
      category: "luxury",
    },
  ];

  const services = [
    {
      icon: Shield,
      title: "URA Duty Clearance",
      description:
        "Full import duty processing and Uganda Revenue Authority clearance handled for you",
    },
    {
      icon: FileText,
      title: "Import Documentation",
      description:
        "Pre-shipment inspection, bond clearance, and all customs paperwork managed end-to-end",
    },
    {
      icon: Wrench,
      title: "Certified Workshop",
      description:
        "State-of-the-art service centre with trained technicians for all major brands",
    },
    {
      icon: Calendar,
      title: "Flexible Financing",
      description:
        "Partnered with Centenary Bank, Stanbic, and DFCU for competitive auto loan rates",
    },
  ];

  const VehicleCard = ({
    vehicle,
  }: {
    vehicle: (typeof vehicles)[0];
  }) => (
    <Card
      key={vehicle.id}
      className="bg-card border-border overflow-hidden group cursor-pointer transition-all hover:border-primary/50"
      onClick={() => setSelectedVehicle(vehicle.id)}
    >
      <div className="relative h-64 overflow-hidden">
        <img
          src={vehicle.image}
          alt={vehicle.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 text-xs font-bold">
          {vehicle.year}
        </div>
        <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm text-foreground px-3 py-1 text-xs font-bold tracking-wide">
          {vehicle.brand}
        </div>
      </div>
      <CardContent className="p-6">
        <div className="mb-4">
          <p className="text-primary text-sm font-semibold mb-1 tracking-wide">
            {vehicle.type}
          </p>
          <h4
            className="text-2xl font-bold mb-2"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            {vehicle.name}
          </h4>
          <p className="text-3xl font-bold text-primary">
            {formatUGX(vehicle.price)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              POWER
            </p>
            <p className="text-sm font-semibold">
              {vehicle.specs.power}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              ENGINE
            </p>
            <p className="text-sm font-semibold">
              {vehicle.specs.engine}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              DRIVE
            </p>
            <p className="text-sm font-semibold">
              {vehicle.specs.drive}
            </p>
          </div>
        </div>
        <Button className="w-full mt-6 bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground font-semibold">
          VIEW DETAILS
          <ChevronRight className="ml-2" size={18} />
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-primary flex items-center justify-center">
                <div className="w-3 h-3 bg-primary" />
              </div>
              <h1
                className="text-2xl font-bold tracking-tight"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                <span className="text-primary">PANDA</span>
                <span className="text-foreground ml-2">
                  MOTORS
                </span>
              </h1>
            </div>

            <nav className="hidden md:flex items-center space-x-8">
              <a
                href="#inventory"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                INVENTORY
              </a>
              <a
                href="#services"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                SERVICES
              </a>
              <a
                href="#about"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                ABOUT
              </a>
              <a
                href="#contact"
                className="text-sm font-medium hover:text-primary transition-colors"
              >
                CONTACT
              </a>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                BOOK TEST DRIVE
              </Button>
            </nav>

            <button
              className="md:hidden p-2 hover:bg-secondary rounded-sm transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X size={24} />
              ) : (
                <Menu size={24} />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-card">
            <nav className="px-6 py-4 space-y-4">
              <a
                href="#inventory"
                className="block text-sm font-medium hover:text-primary transition-colors"
              >
                INVENTORY
              </a>
              <a
                href="#services"
                className="block text-sm font-medium hover:text-primary transition-colors"
              >
                SERVICES
              </a>
              <a
                href="#about"
                className="block text-sm font-medium hover:text-primary transition-colors"
              >
                ABOUT
              </a>
              <a
                href="#contact"
                className="block text-sm font-medium hover:text-primary transition-colors"
              >
                CONTACT
              </a>
              <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                BOOK TEST DRIVE
              </Button>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative h-screen mt-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent z-10" />
        <img
          src="https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=1600&q=80"
          alt="Premium Vehicle"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-20 max-w-7xl mx-auto px-6 lg:px-8 h-full flex flex-col justify-center">
          <div className="max-w-2xl">
            <p className="text-primary text-sm font-bold tracking-[0.3em] mb-4 uppercase">
              Kampala, Uganda
            </p>
            <h2
              className="text-6xl md:text-8xl font-bold mb-6 leading-none tracking-tight"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              DRIVE THE
              <br />
              <span className="text-primary">PEARL OF</span>
              <br />
              AFRICA
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-lg">
              Uganda's premier destination for luxury and 4x4
              vehicles. Imported, cleared, and ready to conquer
              Kampala's roads and beyond.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base h-14 px-8"
                onClick={() =>
                  document
                    .getElementById("inventory")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                EXPLORE STOCK
                <ChevronRight className="ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold text-base h-14 px-8"
                onClick={() =>
                  document
                    .getElementById("contact")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                GET A QUOTE
              </Button>
            </div>
          </div>
        </div>

        {/* Uganda flag stripe accent */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex h-2">
          <div className="flex-1 bg-[#000000]" />
          <div className="flex-1 bg-[#FCDC04]" />
          <div className="flex-1 bg-[#DE3908]" />
          <div className="flex-1 bg-[#000000]" />
          <div className="flex-1 bg-[#FCDC04]" />
          <div className="flex-1 bg-[#DE3908]" />
        </div>
      </section>

      {/* Search Section */}
      <section className="py-16 px-6 lg:px-8 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-sm text-muted-foreground mb-6 tracking-widest font-semibold">
            SEARCH OUR BANDA SHOWROOM INVENTORY
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              type="text"
              placeholder="Brand (Toyota, BMW...)"
              className="bg-input-background border-border h-12 pl-4"
            />
            <Input
              type="text"
              placeholder="Model Year"
              className="bg-input-background border-border h-12 pl-4"
            />
            <Input
              type="text"
              placeholder="Max Budget (UGX)"
              className="bg-input-background border-border h-12 pl-4"
            />
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-semibold">
              <Search className="mr-2" size={18} />
              SEARCH STOCK
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Inventory */}
      <section id="inventory" className="py-24 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h3
              className="text-5xl md:text-6xl font-bold mb-4"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              CURRENT STOCK
            </h3>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              All vehicles are Japan- and UK-imported, URA duty
              paid, and ready for immediate registration with
              UNRA.
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-4 mb-12 bg-card border border-border h-12">
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold"
              >
                ALL
              </TabsTrigger>
              <TabsTrigger
                value="luxury"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold"
              >
                LUXURY
              </TabsTrigger>
              <TabsTrigger
                value="sport"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold"
              >
                SPORT
              </TabsTrigger>
              <TabsTrigger
                value="4x4"
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold"
              >
                4X4
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {vehicles.map((vehicle) => (
                  <VehicleCard
                    key={vehicle.id}
                    vehicle={vehicle}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="luxury">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {vehicles
                  .filter((v) => v.category === "luxury")
                  .map((vehicle) => (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                    />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="sport">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {vehicles
                  .filter((v) => v.category === "sport")
                  .map((vehicle) => (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                    />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="4x4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {vehicles
                  .filter((v) =>
                    [
                      "Luxury SUV",
                      "Sport Luxury SUV",
                      "Premium SUV",
                      "Ultra Luxury SUV",
                      "Sports SUV",
                    ].includes(v.type),
                  )
                  .map((vehicle) => (
                    <VehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                    />
                  ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Services Section */}
      <section
        id="services"
        className="py-24 px-6 lg:px-8 bg-card border-y border-border"
      >
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h3
              className="text-5xl md:text-6xl font-bold mb-4"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              OUR SERVICES
            </h3>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From import to keys-in-hand — we handle every step
              so you drive with total confidence.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {services.map((service, index) => (
              <div key={index} className="text-center group">
                <div className="mb-6 inline-flex items-center justify-center w-20 h-20 border-2 border-primary/30 group-hover:border-primary group-hover:bg-primary/10 transition-all">
                  <service.icon
                    className="text-primary"
                    size={40}
                  />
                </div>
                <h4
                  className="text-xl font-bold mb-3"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                  }}
                >
                  {service.title}
                </h4>
                <p className="text-muted-foreground">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h3
                className="text-5xl md:text-6xl font-bold mb-6"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                BANDA'S
                <br />
                <span className="text-primary">
                  TRUSTED DEALER
                </span>
                <br />
                SINCE 2025
              </h3>
              <p className="text-lg text-muted-foreground mb-6">
                Panda Motors Ltd was founded in Banda with one
                goal: bring world-class vehicles to Ugandan
                roads. From day one we have been the preferred
                choice for business leaders, entrepreneurs, and
                discerning drivers across East Africa.
              </p>
              <p className="text-lg text-muted-foreground mb-8">
                Every vehicle is sourced directly from Japan,
                the UK, and the UAE — inspected before shipment,
                cleared through URA, and registered with UNRA on
                your behalf.
              </p>
              <div className="grid grid-cols-3 gap-8 pt-8 border-t border-border">
                <div>
                  <p
                    className="text-4xl font-bold text-primary mb-2"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                    }}
                  >
                    500+
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Vehicles Sold
                  </p>
                </div>
                <div>
                  <p
                    className="text-4xl font-bold text-primary mb-2"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                    }}
                  >
                    EST.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    2025 — Banda
                  </p>
                </div>
                <div>
                  <p
                    className="text-4xl font-bold text-primary mb-2"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                    }}
                  >
                    EA-WIDE
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Delivery Network
                  </p>
                </div>
              </div>
            </div>
            <div className="relative h-[600px]">
              <img
                src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80"
                alt="Pearl Motors Showroom"
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 h-1 flex">
                <div className="flex-1 bg-[#000000]" />
                <div className="flex-1 bg-[#FCDC04]" />
                <div className="flex-1 bg-[#DE3908]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section
        id="contact"
        className="py-24 px-6 lg:px-8 bg-card border-t border-border"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            <div>
              <h3
                className="text-5xl md:text-6xl font-bold mb-6"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                VISIT OUR
                <br />
                <span className="text-primary">BANDA</span>
                <br />
                SHOWROOM
              </h3>
              <p className="text-lg text-muted-foreground mb-8">
                Walk in or call ahead. Our consultants speak
                Luganda, English, and Swahili — no pressure,
                just expert advice.
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <MapPin
                    className="text-primary mt-1 flex-shrink-0"
                    size={24}
                  />
                  <div>
                    <h4 className="font-bold mb-1">ADDRESS</h4>
                    <p className="text-muted-foreground">
                      Banda, Jinja Road
                      <br />
                      Kampala, Uganda
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Phone
                    className="text-primary mt-1 flex-shrink-0"
                    size={24}
                  />
                  <div>
                    <h4 className="font-bold mb-1">
                      PHONE / WHATSAPP
                    </h4>
                    <p className="text-muted-foreground">
                      +256 770 826 951
                    </p>
                    <p className="text-muted-foreground">
                      +256 756 053 475
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Mail
                    className="text-primary mt-1 flex-shrink-0"
                    size={24}
                  />
                  <div>
                    <h4 className="font-bold mb-1">EMAIL</h4>
                    <p className="text-muted-foreground">
                      sales@pandamotors.co.ug
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Calendar
                    className="text-primary mt-1 flex-shrink-0"
                    size={24}
                  />
                  <div>
                    <h4 className="font-bold mb-1">
                      OPENING HOURS
                    </h4>
                    <p className="text-muted-foreground">
                      Monday – Friday: 8:00 AM – 6:00 PM
                      <br />
                      Saturday: 9:00 AM – 5:00 PM
                      <br />
                      Sunday: Closed
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-background border border-border p-8">
              <h4
                className="text-2xl font-bold mb-2"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                REQUEST A QUOTE
              </h4>
              <p className="text-muted-foreground text-sm mb-6">
                We respond within 30 minutes during business
                hours.
              </p>
              <form className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="First Name"
                    className="bg-input-background border-border h-12"
                  />
                  <Input
                    placeholder="Last Name"
                    className="bg-input-background border-border h-12"
                  />
                </div>
                <Input
                  type="email"
                  placeholder="Email Address"
                  className="bg-input-background border-border h-12"
                />
                <Input
                  type="tel"
                  placeholder="+256 700 000 000"
                  className="bg-input-background border-border h-12"
                />
                <Input
                  placeholder="Vehicle of Interest (e.g. Land Cruiser V8)"
                  className="bg-input-background border-border h-12"
                />
                <textarea
                  placeholder="Any additional requirements or questions..."
                  rows={4}
                  className="w-full px-4 py-3 bg-input-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 font-semibold">
                  SEND ENQUIRY
                </Button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-12 px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4
                className="text-xl font-bold mb-4"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                }}
              >
                <span className="text-primary">PANDA</span>{" "}
                MOTORS LTD
              </h4>
              <p className="text-muted-foreground text-sm mb-3">
                Banda, Jinja Road, Kampala, Uganda
              </p>
              <p className="text-muted-foreground text-sm">
                Uganda's trusted luxury vehicle importer,
                established 2025.
              </p>
            </div>
            <div>
              <h5 className="font-bold mb-4">QUICK LINKS</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#inventory"
                    className="hover:text-primary transition-colors"
                  >
                    Stock
                  </a>
                </li>
                <li>
                  <a
                    href="#services"
                    className="hover:text-primary transition-colors"
                  >
                    Services
                  </a>
                </li>
                <li>
                  <a
                    href="#about"
                    className="hover:text-primary transition-colors"
                  >
                    About Us
                  </a>
                </li>
                <li>
                  <a
                    href="#contact"
                    className="hover:text-primary transition-colors"
                  >
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-4">SERVICES</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    URA Import Clearance
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    Bank Financing
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    Vehicle Inspection
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    UNRA Registration
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-bold mb-4">CONNECT</h5>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    Facebook
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    WhatsApp
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="hover:text-primary transition-colors"
                  >
                    TikTok
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                &copy; 2025 Panda Motors Ltd. All rights
                reserved. | Banda, Jinja Road, Kampala
              </p>
              <div className="flex gap-1 h-3">
                <div className="w-8 bg-[#000000]" />
                <div className="w-8 bg-[#FCDC04]" />
                <div className="w-8 bg-[#DE3908]" />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}