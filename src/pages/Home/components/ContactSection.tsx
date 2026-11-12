import { useState, type FormEvent } from "react";
import { Calendar, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ContactSection() {
  const [enquiryOptions, setEnquiryOptions] = useState<{
    whatsApp: string;
    email: string;
  } | null>(null);

  function handleEnquirySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const name = [formData.get("firstName"), formData.get("lastName")]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" ");
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const vehicle = String(formData.get("vehicle") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const text = [
      "Hello Panda Motors, I would like to make an enquiry.",
      `Name: ${name}`,
      `Email: ${email}`,
      phone && `Phone: ${phone}`,
      vehicle && `Vehicle of interest: ${vehicle}`,
      message && `Message: ${message}`,
    ]
      .filter(Boolean)
      .join("\n");
    const subject = `Vehicle enquiry from ${name}`;
    const encodedText = encodeURIComponent(text);

    setEnquiryOptions({
      whatsApp: `https://wa.me/256770826951?text=${encodedText}`,
      email: `mailto:sales@pandamotors.co.ug?subject=${encodeURIComponent(subject)}&body=${encodedText}`,
    });
  }

  return (
    <section id="contact" className="py-24 px-6 lg:px-8 bg-card border-t border-border">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <h3 className="text-5xl md:text-6xl font-bold mb-6">
              VISIT OUR
              <br />
              <span className="text-primary">BANDA</span>
              <br />
              SHOWROOM
            </h3>
            <p className="text-lg text-muted-foreground mb-8">
              Walk in or call ahead. Our consultants speak Luganda, English, and Swahili — no
              pressure, just expert advice.
            </p>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin className="text-primary mt-1" size={24} />
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
                <Phone className="text-primary mt-1" size={24} />
                <div>
                  <h4 className="font-bold mb-1">PHONE / WHATSAPP</h4>
                  <p className="text-muted-foreground">
                    +256 770 826 951
                    <br />
                    +256 756 053 475
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className="text-primary mt-1" size={24} />
                <div>
                  <h4 className="font-bold mb-1">EMAIL</h4>
                  <p className="text-muted-foreground">sales@pandamotors.co.ug</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Calendar className="text-primary mt-1" size={24} />
                <div>
                  <h4 className="font-bold mb-1">OPENING HOURS</h4>
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
          <div className="bg-background border border-border rounded-lg p-8">
            <h4 className="text-2xl font-bold mb-2">REQUEST A QUOTE</h4>
            <p className="text-muted-foreground text-sm mb-6">
              We respond within 30 minutes during business hours.
            </p>
            <form className="space-y-6" onSubmit={handleEnquirySubmit}>
              <div className="grid grid-cols-2 gap-4">
                <Input name="firstName" placeholder="First Name" autoComplete="given-name" className="h-12" required />
                <Input name="lastName" placeholder="Last Name" autoComplete="family-name" className="h-12" required />
              </div>
              <Input name="email" type="email" placeholder="Email Address" autoComplete="email" className="h-12" required />
              <Input name="phone" type="tel" placeholder="Phone (optional)" autoComplete="tel" className="h-12" />
              <Input name="vehicle" placeholder="Vehicle of Interest (optional)" className="h-12" />
              <textarea
                name="message"
                placeholder="Any additional requirements or questions..."
                rows={4}
                className="w-full px-4 py-3 border border-border rounded-lg bg-background"
              />
              <Button type="submit" className="w-full h-12 bg-primary text-white hover:bg-primary/90">
                SEND ENQUIRY
              </Button>
              {enquiryOptions && (
                <div className="space-y-3" role="status" aria-live="polite">
                  <p className="text-sm text-muted-foreground">
                    Choose how you would like to contact our team. Your enquiry is not sent until you send it from the selected app.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Button asChild type="button" variant="outline" className="h-11">
                      <a href={enquiryOptions.whatsApp} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="mr-2" size={17} /> WhatsApp
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline" className="h-11">
                      <a href={enquiryOptions.email}>
                        <Mail className="mr-2" size={17} /> Email
                      </a>
                    </Button>
                    <Button asChild type="button" variant="outline" className="h-11">
                      <a href="tel:+256770826951">
                        <Phone className="mr-2" size={17} /> Call showroom
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
