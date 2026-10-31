// Brand-backed hubs. A business sponsors the hubs that match what it sells
// and gives their members extra perks. One perk is live in the prototype:
// paying at the brand's own store with a sponsored hub's card earns cash back
// onto that card.
//
// The brands are fictional examples (the same stores as the purchase tester).

const BRANDS = [
  {
    id: "freshmart",
    name: "FreshMart",
    merchant: "FreshMart Groceries",
    color: "#34c77b",
    category: "food and groceries",
    tagline: "Join FreshMart's grocery hubs",
    pitch: "FreshMart backs neighborhood grocery hubs, so members' money goes further at the checkout.",
    cashback: 0.05,
    benefits: [
      { icon: "%", title: "5% back at FreshMart", text: "Pay with your hub card at FreshMart and 5% comes back onto the card." },
      { icon: "+", title: "FreshMart adds 10% to the pool", text: "For every dollar members put in, FreshMart adds 10 cents." },
      { icon: "★", title: "Member prices", text: "Weekly member-only prices on fresh produce and staples." },
    ],
  },
  {
    id: "solestreet",
    name: "Sole Street",
    merchant: "Sole Street Shoes",
    color: "#a77bff",
    category: "shoes and clothing",
    tagline: "Join Sole Street's shoe and clothing hubs",
    pitch: "Sole Street helps families keep growing kids in shoes that fit, all year round.",
    cashback: 0.1,
    benefits: [
      { icon: "%", title: "10% back at Sole Street", text: "Pay with your hub card at Sole Street and 10% comes back onto the card." },
      { icon: "↺", title: "Free size swaps", text: "Kids outgrew them? Swap for the next size within 60 days." },
      { icon: "★", title: "Back-to-school bonus", text: "Sole Street adds $20 per member to the pool every August." },
    ],
  },
  {
    id: "citypharmacy",
    name: "City Pharmacy",
    merchant: "City Pharmacy",
    color: "#5b9bff",
    category: "medical expenses",
    tagline: "Join City Pharmacy's health hubs",
    pitch: "City Pharmacy supports medical mutual-aid hubs so prescriptions are never out of reach.",
    cashback: 0.05,
    benefits: [
      { icon: "%", title: "5% back on prescriptions", text: "Pay with your hub card at City Pharmacy and 5% comes back onto the card." },
      { icon: "→", title: "Free delivery", text: "Members get prescriptions delivered at no charge." },
      { icon: "?", title: "Pharmacist on call", text: "Ask a pharmacist anything, any time, by phone or chat." },
    ],
  },
];

// Each brand sponsors the built-in hubs whose purpose matches what it sells.
for (const hub of hubs) {
  const brand = BRANDS.find((b) => b.category === hub.purpose.category);
  if (brand) hub.brandId = brand.id;
}

const brandFor = (hub) => BRANDS.find((b) => b.id === hub?.brandId) || null;
const brandHubs = (brand) => hubs.filter((h) => h.brandId === brand.id);
