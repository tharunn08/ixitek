// Central product/category data model.
// icon: lucide-react icon name (resolved in components via a lookup map)

export const categories = [
  {
    id: "fiber-optics",
    slug: "fiber-optics",
    name: "Fiber Optics",
    icon: "Cable",
    image: "/images/categories/fiber-optics.jpg",
    shortDescription:
      "Transceivers, patch cords, connectors, adapters, cables, pigtails & attenuators for high-speed optical networks.",
    heroDescription:
      "End-to-end fiber optic connectivity — from transceivers and AOC/DAC cabling to patch cords, connectors, adapters and attenuators — engineered for data centres, carrier networks and enterprise backbones.",
    stat: { value: "7", label: "product families" },
  },
  {
    id: "network-tm",
    slug: "network-tm",
    name: "Network / T&M",
    icon: "Radar",
    image: "/images/categories/network-tm.jpg",
    shortDescription:
      "Traffic generation, network components and optical switching for test, measurement and network validation.",
    heroDescription:
      "Purpose-built test and measurement platforms — traffic generators, network emulators and optical switches — that validate performance before your network goes live.",
    stat: { value: "3", label: "product families" },
  },
  {
    id: "data-centre-infrastructure",
    slug: "data-centre-infrastructure",
    name: "Data Centre Infrastructure",
    icon: "ServerCog",
    image: "/images/categories/data-centre-infrastructure.jpg",
    shortDescription:
      "Rack builds, structured cabling, and power distribution for mission-critical facilities.",
    heroDescription:
      "From server racks and PDUs to full data centre build-out and relocation, we deliver the physical infrastructure layer your operations run on.",
    stat: { value: "3", label: "product families" },
  },
  {
    id: "enterprise-solutions",
    slug: "enterprise-solutions",
    name: "Enterprise Solutions",
    icon: "Users",
    image: "/images/categories/enterprise-solutions.jpg",
    shortDescription:
      "IT staff augmentation and technical resourcing to extend your engineering team.",
    heroDescription:
      "Scale your technical capacity on demand with vetted engineers and specialists — engaged directly, managed by you, delivered by Ixitek.",
    stat: { value: "1", label: "solution area" },
  },
];

export const families = [
  // ---------------- FIBER OPTICS ----------------
  {
    id: "transceivers-aoc-dac",
    slug: "transceivers-aoc-dac",
    categorySlug: "fiber-optics",
    name: "Transceivers & AOC/DAC",
    icon: "Zap",
    image: "/images/products/transceivers-aoc-dac.jpg",
    shortDescription:
      "Pluggable optical transceivers and active/passive copper cabling for 10G–400G Ethernet fabrics.",
    description:
      "Our transceiver and AOC/DAC portfolio covers the full speed curve of modern Ethernet fabrics — from 10G SFP+ to 400G QSFP-DD — giving network architects a single source for optics and direct-attach cabling that's tested for interoperability across major switch platforms.",
    highlights: [
      "Supports 10G, 25G, 40G, 50G, 100G & 400G Ethernet",
      "Active Optical Cables (AOC) and Direct Attach Copper (DAC)",
      "Multi-vendor coded & interoperability tested",
      "Single-mode and multi-mode transceiver options",
    ],
    variants: [
      "SFP+ 10G Transceiver",
      "QSFP28 100G Transceiver",
      "QSFP-DD 400G Transceiver",
      "Active Optical Cable (AOC)",
      "Direct Attach Copper (DAC)",
    ],
    specs: [
      { label: "Data Rates", value: "10G / 25G / 40G / 50G / 100G / 400G" },
      { label: "Form Factors", value: "SFP+, SFP28, QSFP28, QSFP-DD" },
      { label: "Fiber Type", value: "Single-mode & Multi-mode" },
      { label: "Compatibility", value: "Multi-vendor switch platforms" },
    ],
  },
  {
    id: "patch-cords",
    slug: "patch-cords",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Patch Cords",
    icon: "Cable",
    image: "/images/products/patch-cords.jpg",
    shortDescription:
      "26 single-mode and multi-mode patch cord configurations across FC, LC, SC, ST and APC connectors.",
    description:
      "A comprehensive patch cord range spanning single-mode 9/125µm and multi-mode OM1–OM4 grades, built with FC, LC, SC, ST and APC connector combinations for structured cabling, cross-connects and equipment jumpers.",
    highlights: [
      "Single-mode (9/125µm) and multi-mode (OM1–OM4) options",
      "Simplex & duplex configurations",
      "Low insertion loss, high return loss connectors",
      "2mm and 3mm jacket options available",
    ],
    variants: [
      "FC-FC SM 9/125µm Simplex",
      "FC-LC SM 9/125µm Duplex & Simplex",
      "LC-LC SM 9/125µm 2mm Duplex & Simplex",
      "SC-LC SM 9/125µm Simplex",
      "SC-SC SM 9/125µm Simplex",
      "SC/APC-LC/PC SM 9/125µm Duplex & Simplex",
      "SC/APC-SC/APC SM 9/125µm Duplex & Simplex",
      "SC/APC-SC/PC SM 9/125µm Duplex & Simplex",
      "LC-LC MM OM1/OM2 Duplex",
      "LC-LC MM OM3 & OM4 Duplex",
      "SC-LC MM OM3 & OM4 Duplex",
      "SC-SC MM OM1/OM2/OM3/OM4 Duplex",
      "ST-ST MM OM1 & OM2 Duplex",
    ],
    specs: [
      { label: "Fiber Grade", value: "SM 9/125µm, MM OM1–OM4" },
      { label: "Connectors", value: "FC, LC, SC, ST, SC/APC" },
      { label: "Configuration", value: "Simplex & Duplex" },
      { label: "Jacket", value: "2mm / 3mm PVC or LSZH" },
    ],
  },
  {
    id: "connectors",
    slug: "connectors",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Connectors",
    icon: "Plug",
    image: "/images/products/connectors.jpg",
    shortDescription:
      "FC, LC, SC and ST connectors in simplex, duplex, single-mode and multi-mode variants.",
    description:
      "Precision-ferrule fiber optic connectors for field termination and factory assembly, covering the full range of FC, LC, SC and ST formats used across enterprise and carrier networks.",
    highlights: [
      "Ceramic ferrule construction for low insertion loss",
      "APC and UPC polish options",
      "Colour-coded housings for fast identification",
      "Simplex & duplex clip variants",
    ],
    variants: [
      "FC Simplex Connector",
      "LC APC Simplex Connector",
      "LC Multi Mode Beige Duplex Connector",
      "LC Multi Mode OM3 Duplex Connector",
      "LC Multi Mode Simplex Connector",
      "LC Single Mode Duplex Connector",
      "LC Simplex Connector",
      "SC APC Simplex Connector",
      "SC Simplex Connector",
      "ST Simplex Connector",
    ],
    specs: [
      { label: "Polish", value: "UPC / APC" },
      { label: "Ferrule", value: "Ceramic, 2.5mm / 1.25mm" },
      { label: "Formats", value: "FC, LC, SC, ST" },
      { label: "Configuration", value: "Simplex & Duplex" },
    ],
  },
  {
    id: "adapters",
    slug: "adapters",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Adapters",
    icon: "Link2",
    image: "/images/products/adapters.jpg",
    shortDescription:
      "Coupling adapters across FC, LC, SC and ST formats for patch panels and enclosures.",
    description:
      "Optical adapters that couple two connectorized fiber ends within patch panels, distribution frames and enclosures — precision-aligned for minimal signal loss.",
    highlights: [
      "Precision ceramic sleeve alignment",
      "Panel-mount flange and clip designs",
      "APC and multi-mode variants available",
      "Colour-coded for quick identification",
    ],
    variants: [
      "Fiber Optic FC Simplex Adapter",
      "Fiber Optic LC Multi Mode Beige Duplex Adapter",
      "Fiber Optic LC Multi Mode OM3 Duplex Adapter",
      "Fiber Optic LC Single Mode Duplex Adapter",
      "Fiber Optic LC Simplex Adapter",
      "Fiber Optic SC APC Simplex Adapter",
      "Fiber Optic SC Multi Mode Duplex Adapter",
      "Fiber Optic SC Duplex Adapter",
      "Fiber Optic SC Simplex Adapter",
      "Fiber Optic ST Simplex Adapter",
    ],
    specs: [
      { label: "Formats", value: "FC, LC, SC, ST" },
      { label: "Mount", value: "Panel flange / clip" },
      { label: "Alignment Sleeve", value: "Ceramic" },
      { label: "Configuration", value: "Simplex & Duplex" },
    ],
  },
  {
    id: "cables",
    slug: "cables",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Cables",
    icon: "Waypoints",
    image: "/images/products/cables.jpg",
    shortDescription:
      "Simplex, duplex and armored fiber cable in bulk spool lengths for data centre and industrial runs.",
    description:
      "Bulk fiber optic cable engineered for data centre, laboratory and industrial deployments — available in simplex, duplex and armored constructions, supplied in kilometer-length spools to your specification.",
    highlights: [
      "Bulk spool lengths supplied in kilometers",
      "Simplex, duplex and hybrid constructions",
      "Steel-tape and corrugated armored options",
      "Indoor/outdoor rated jacketing",
    ],
    variants: [
      "Fiber Optic Duplex Cable",
      "Fiber Optic Simplex Cable",
      "Simplex Armored Fiber Optic Cable",
      "Duplex Armored Fiber Optic Cable — Type 1",
      "Duplex Armored Fiber Optic Cable — Type 2",
      "Duplex Armored Fiber Optic Cable — Type 3",
    ],
    specs: [
      { label: "Construction", value: "Simplex, Duplex, Armored" },
      { label: "Supply Format", value: "Bulk spools (km lengths)" },
      { label: "Armoring", value: "Steel tape / corrugated" },
      { label: "Rating", value: "Indoor & Outdoor" },
    ],
  },
  {
    id: "pigtails",
    slug: "pigtails",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Pigtails",
    icon: "GitBranch",
    image: "/images/products/pigtails.jpg",
    shortDescription:
      "15 single-mode and multi-mode pigtail variants across FC, LC, SC and ST connectors.",
    description:
      "Single-ended fiber pigtails for splicing into distribution frames and enclosures, available across FC, LC, SC and ST connector formats in single-mode and OM1–OM4 multi-mode grades.",
    highlights: [
      "Single-mode 9/125µm and multi-mode OM1–OM4",
      "Factory-polished connector ends",
      "900µm tight-buffer construction",
      "Ready for fusion splicing",
    ],
    variants: [
      "FC SM 9/125µm Simplex Pigtail",
      "LC MM OM1 62.5/125µm Simplex Pigtail",
      "LC MM OM2 50/125µm Simplex Pigtail",
      "LC MM OM3 50/125µm Simplex Pigtail",
      "LC MM OM4 50/125µm Simplex Pigtail",
      "LC SM 9/125µm Simplex Pigtail",
      "SC MM OM4 50/125µm Simplex Pigtail",
      "SC APC SM 9/125µm Simplex Pigtail",
      "SC MM OM1 62.5/125µm Simplex Pigtail",
      "SC MM OM2 50/125µm Simplex Pigtail",
      "SC MM OM3 50/125µm Simplex Pigtail",
      "SC SM 9/125µm Simplex Pigtail",
      "ST MM OM1 62.5/125µm Simplex Pigtail",
      "ST MM OM2 50/125µm Simplex Pigtail",
      "ST SM 9/125µm Simplex Pigtail",
    ],
    specs: [
      { label: "Fiber Grade", value: "SM 9/125µm, MM OM1–OM4" },
      { label: "Connectors", value: "FC, LC, SC, ST" },
      { label: "Buffer", value: "900µm tight buffer" },
      { label: "Configuration", value: "Simplex" },
    ],
  },
  {
    id: "attenuators",
    slug: "attenuators",
    categorySlug: "fiber-optics",
    name: "Fiber Optic Attenuators",
    icon: "SlidersHorizontal",
    image: "/images/products/attenuators.jpg",
    shortDescription: "Fixed in-line and connector-style attenuators for optical power management.",
    description:
      "Fixed optical attenuators used to control received signal power and protect sensitive optical receivers from overload across single-mode links.",
    highlights: [
      "Fixed attenuation values for predictable loss",
      "In-line and connector (male/female) formats",
      "Protects receivers from signal overload",
      "Available across standard connector types",
    ],
    variants: ["Fiber Optic Fixed Attenuator — Type A", "Fiber Optic Fixed Attenuator — Type B"],
    specs: [
      { label: "Type", value: "Fixed, in-line" },
      { label: "Application", value: "Optical power management" },
      { label: "Connector Styles", value: "Male / Female" },
      { label: "Fiber Type", value: "Single-mode" },
    ],
  },

  // ---------------- NETWORK / T&M ----------------
  {
    id: "traffic-generators",
    slug: "traffic-generators",
    categorySlug: "network-tm",
    name: "Traffic Generators",
    icon: "Activity",
    image: "/images/products/traffic-generators.jpg",
    shortDescription:
      "L2–L7 network test platforms and impairment/emulation tools for pre-deployment validation.",
    description:
      "Network test platforms that generate, capture and analyze traffic across Layer 2 through Layer 7 — used to validate performance, stress-test infrastructure and simulate real-world network conditions before go-live.",
    highlights: [
      "Layer 2–7 application-aware traffic generation",
      "Layer 2–3 line-rate performance testing",
      "Network impairment & emulation (latency, jitter, loss)",
      "Detailed performance & conformance reporting",
    ],
    variants: [
      "L2-7 Network Test Platform",
      "L2-3 Network Test Platform",
      "Impairment & Network Emulation",
    ],
    specs: [
      { label: "Test Layers", value: "Layer 2 through Layer 7" },
      { label: "Emulation", value: "Latency, jitter, packet loss" },
      { label: "Use Case", value: "Pre-deployment & regression testing" },
      { label: "Reporting", value: "Detailed conformance reports" },
    ],
  },
  {
    id: "network-components-cables",
    slug: "network-components-cables",
    categorySlug: "network-tm",
    name: "Network Components & Cables",
    icon: "Network",
    image: "/images/products/network-components-cables.jpg",
    shortDescription: "Copper and structured cabling components for enterprise LAN infrastructure.",
    description:
      "Structured cabling components — copper patch cables, jack panels and network hardware — that complete the physical layer of enterprise LAN and data centre deployments.",
    highlights: [
      "Cat5e / Cat6 / Cat6a copper cabling",
      "Patch panels and jack modules",
      "Cable management accessories",
      "Tested for standards compliance",
    ],
    variants: ["Copper Patch Cables", "Jack Panels & Modules", "Cable Management Accessories"],
    specs: [
      { label: "Cable Grades", value: "Cat5e, Cat6, Cat6a" },
      { label: "Termination", value: "RJ45 / Keystone" },
      { label: "Application", value: "LAN & structured cabling" },
      { label: "Compliance", value: "Industry cabling standards" },
    ],
  },
  {
    id: "optical-switches",
    slug: "optical-switches",
    categorySlug: "network-tm",
    name: "Optical Switches",
    icon: "GitCompareArrows",
    image: "/images/products/optical-switches.jpg",
    shortDescription:
      "Fiber optical switches for automated network path switching, redundancy and test bypass.",
    description:
      "Optical switches enable automated redirection of optical signals across fiber paths — used for network redundancy, inline tool bypass, and automating manual patch changes during testing and monitoring.",
    highlights: [
      "1xN and NxN optical switching topologies",
      "Automated failover & redundancy paths",
      "Low insertion loss, high repeatability",
      "API / remote control for lab automation",
    ],
    variants: ["1xN Optical Switch", "NxN Optical Matrix Switch", "Bypass Switch Module"],
    specs: [
      { label: "Topology", value: "1xN and NxN" },
      { label: "Insertion Loss", value: "Low-loss single-mode paths" },
      { label: "Control", value: "Remote / API controllable" },
      { label: "Application", value: "Redundancy, bypass, test automation" },
    ],
  },

  // ---------------- DATA CENTRE INFRASTRUCTURE ----------------
  {
    id: "data-center-build-solutions",
    slug: "data-center-build-solutions",
    categorySlug: "data-centre-infrastructure",
    name: "Data Center Build Solutions",
    icon: "Building2",
    image: "/images/products/data-center-build-solutions.jpg",
    shortDescription:
      "End-to-end data centre relocation, cabling, rack & stack, and preventive maintenance services.",
    description:
      "A full-lifecycle build and operations service covering data centre relocation, network drop installation, structured cabling, rack-and-stack, and preventive maintenance — delivered with documented, standardized processes.",
    highlights: [
      "Data centre relocation with minimal downtime",
      "Network drop installation & standardized labelling",
      "Rack-and-stack of DC components",
      "Structured network & fiber channel cabling with testing",
      "Remote power & network administration",
      "Inventory planning, preventive maintenance & AMC",
    ],
    variants: [
      "Data Centre Relocation",
      "Structured Cabling & Testing",
      "Rack & Stack Services",
      "Preventive Maintenance & AMC",
    ],
    specs: [
      { label: "Scope", value: "Design, build, relocate, maintain" },
      { label: "Cabling", value: "Structured network & fiber channel" },
      { label: "Documentation", value: "Standardized labelling & diagrams" },
      { label: "Support", value: "Remote administration & AMC" },
    ],
  },
  {
    id: "racks",
    slug: "racks",
    categorySlug: "data-centre-infrastructure",
    name: "Racks",
    icon: "Rows3",
    image: "/images/products/racks.jpg",
    shortDescription:
      "Server racks, networking racks and cable trays built to industrial data centre standards.",
    description:
      "Industrial-grade server and networking racks constructed from 14-gauge steel, with configurable depth, ventilation and accessory options for enterprise data centre and network room deployments.",
    highlights: [
      "42U server racks, 650–1200mm depth options",
      "18U floor-standing networking racks",
      "Top-mounted ventilation fans",
      "Cable trays for organized, traceable routing",
    ],
    variants: [
      "42U Server Rack",
      "18U Networking Rack",
      "Cable Tray System",
      "Rack Accessories (PDU mounts, shelves, earthing bars)",
    ],
    specs: [
      { label: "Material", value: "14-gauge steel sheet" },
      { label: "Server Rack Profile", value: "42U, 650 / 800 / 1000 / 1200mm depth" },
      { label: "Network Rack Profile", value: "18U floor standing, 800mm depth" },
      { label: "Accessories", value: "Fans, shelves, PDU mounts, earthing bars" },
    ],
  },
  {
    id: "pdus",
    slug: "pdus",
    categorySlug: "data-centre-infrastructure",
    name: "PDUs",
    icon: "PlugZap",
    image: "/images/products/pdus.jpg",
    shortDescription:
      "Basic, metered, and switched & monitored power distribution units from Raritan, ATEN, Enlogic & APC.",
    description:
      "Rack power distribution units spanning basic, metered, and switched & monitored classes — sourced from leading manufacturers including Raritan, ATEN, Enlogic and APC — for reliable, observable power delivery.",
    highlights: [
      "Basic PDUs: horizontal & vertical, 12/24/36-port",
      "Metered PDUs with digital load display",
      "Switched & monitored PDUs with remote outlet control",
      "Pre-failure overload alerts & sequencing management",
    ],
    variants: ["Basic PDU", "Metered PDU", "Switched & Monitored PDU"],
    specs: [
      { label: "Formats", value: "Horizontal & Vertical rack mount" },
      { label: "Ports", value: "12 / 24 / 36-port configurations" },
      { label: "Monitoring", value: "Digital metering, remote outlet control" },
      { label: "Brands", value: "Raritan, ATEN, Enlogic, APC" },
    ],
  },

  // ---------------- ENTERPRISE SOLUTIONS ----------------
  {
    id: "it-staff-augmentation",
    slug: "it-staff-augmentation",
    categorySlug: "enterprise-solutions",
    name: "IT Staff Augmentation",
    icon: "UsersRound",
    image: "/images/products/it-staff-augmentation.jpg",
    shortDescription:
      "Hire vetted technical talent globally and manage them directly — scalable from one seat to a full team.",
    description:
      "Extend your engineering capacity with pre-vetted, industry-certified technical specialists engaged directly by your organization — scalable from a single role to a full delivery team, for as long as the project requires.",
    highlights: [
      "Instant access to a vetted technical talent pool",
      "Reduced recruitment overhead & training cost",
      "Engagement from days to months, single seat to full team",
      "Pay-per-use staffing model for efficient resourcing",
    ],
    variants: [
      "Network & Infrastructure Engineers",
      "Data Centre Technicians",
      "ERP / SAP Consultants",
      "Project & Delivery Specialists",
    ],
    specs: [
      { label: "Engagement", value: "Days, weeks, or months" },
      { label: "Scale", value: "Single role to full team" },
      { label: "Model", value: "Direct-managed, pay-per-use" },
      { label: "Talent", value: "Industry-certified specialists" },
    ],
  },
];

export function getCategory(slug) {
  return categories.find((c) => c.slug === slug);
}

export function getFamiliesForCategory(categorySlug) {
  return families.filter((f) => f.categorySlug === categorySlug);
}

export function getFamily(categorySlug, familySlug) {
  return families.find((f) => f.categorySlug === categorySlug && f.slug === familySlug);
}

export function getRelatedFamilies(family, count = 3) {
  return families
    .filter((f) => f.categorySlug === family.categorySlug && f.id !== family.id)
    .slice(0, count);
}

export function searchFamilies(query) {
  const q = query.trim().toLowerCase();
  if (!q) return families;
  return families.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.shortDescription.toLowerCase().includes(q) ||
      f.variants.some((v) => v.toLowerCase().includes(q))
  );
}
