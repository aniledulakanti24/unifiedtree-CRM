// Every other system the CRM can talk to. `data` is what would move, and which way.
export const APPS = [
  {
    "k": "website",
    "name": "Website",
    "icon": "Globe",
    "colors": [
      "#14b8a6",
      "#0f766e"
    ],
    "about": "Turn website enquiries into leads, and show products and prices on your site.",
    "providers": [
      "WordPress",
      "Shopify",
      "Wix",
      "Squarespace",
      "Custom website"
    ],
    "data": [
      [
        "leads",
        "Website enquiries",
        "In",
        "leads"
      ],
      [
        "products",
        "Products and prices",
        "Out",
        "products"
      ],
      [
        "orders",
        "Online orders",
        "In",
        "orders"
      ]
    ]
  },
  {
    "k": "accounting",
    "name": "Accounting",
    "icon": "ChartColumn",
    "colors": [
      "#fbbf24",
      "#d97706"
    ],
    "about": "Send invoices and payments to your accounts, so nobody types them twice.",
    "providers": [
      "QuickBooks",
      "Xero",
      "Sage",
      "NetSuite",
      "SAP Business One",
      "Zoho Books",
      "Tally"
    ],
    "data": [
      [
        "invoices",
        "Invoices",
        "Out",
        "invoices"
      ],
      [
        "payments",
        "Payments",
        "In",
        "payments"
      ],
      [
        "companies",
        "Customers",
        "Out",
        "companies"
      ]
    ]
  },
  {
    "k": "manufacturing",
    "name": "Manufacturing",
    "icon": "Settings",
    "colors": [
      "#a78bfa",
      "#7c3aed"
    ],
    "about": "Turn confirmed orders into production jobs, and see finished stock.",
    "providers": [
      "Unifiedtree Manufacturing",
      "Odoo Manufacturing",
      "Katana",
      "SAP Business One"
    ],
    "data": [
      [
        "orders",
        "Confirmed orders",
        "Out",
        "orders"
      ],
      [
        "products",
        "Finished goods stock",
        "In",
        "products"
      ]
    ]
  },
  {
    "k": "scm",
    "name": "SCM",
    "icon": "Truck",
    "colors": [
      "#22d3ee",
      "#0e7490"
    ],
    "about": "Share deliveries and tracking with your supply chain system.",
    "providers": [
      "Unifiedtree SCM",
      "SAP SCM",
      "Oracle SCM",
      "ShipStation",
      "DHL",
      "FedEx",
      "UPS",
      "Shiprocket"
    ],
    "data": [
      [
        "shipments",
        "Shipments and tracking",
        "In",
        "shipments"
      ],
      [
        "orders",
        "Orders to deliver",
        "Out",
        "orders"
      ]
    ]
  },
  {
    "k": "inventory",
    "name": "Inventory & Warehouse",
    "icon": "Warehouse",
    "colors": [
      "#84cc16",
      "#4d7c0f"
    ],
    "about": "Keep stock levels here the same as in your warehouse system.",
    "providers": [
      "Unifiedtree Inventory",
      "Odoo Inventory",
      "Cin7",
      "NetSuite",
      "Zoho Inventory",
      "Unicommerce"
    ],
    "data": [
      [
        "products",
        "Stock levels",
        "In",
        "products"
      ],
      [
        "stockMoves",
        "Stock movements",
        "In",
        "stockMoves"
      ]
    ]
  },
  {
    "k": "procurement",
    "name": "Procurement",
    "icon": "ShoppingCart",
    "colors": [
      "#c084fc",
      "#9333ea"
    ],
    "about": "Raise purchase requests when stock runs low.",
    "providers": [
      "Unifiedtree Procurement",
      "SAP Ariba",
      "Coupa",
      "Zoho Inventory"
    ],
    "data": [
      [
        "products",
        "Low-stock items",
        "Out",
        "products"
      ]
    ]
  },
  {
    "k": "hr",
    "name": "HR, Attendance & Payroll",
    "icon": "UsersRound",
    "colors": [
      "#10b981",
      "#047857"
    ],
    "about": "Keep your team here the same as your HR system, and share sales for incentives.",
    "providers": [
      "Unifiedtree HR",
      "Workday",
      "BambooHR",
      "ADP",
      "Zoho People",
      "Keka",
      "greytHR"
    ],
    "data": [
      [
        "users",
        "People and teams",
        "In",
        "users"
      ],
      [
        "deals",
        "Won deals for incentives",
        "Out",
        "deals"
      ]
    ]
  },
  {
    "k": "marketing",
    "name": "Marketing",
    "icon": "Megaphone",
    "colors": [
      "#fb7185",
      "#e11d48"
    ],
    "about": "Share contacts for campaigns, and bring campaign leads back.",
    "providers": [
      "Mailchimp",
      "HubSpot Marketing",
      "Meta Lead Ads",
      "Google Ads",
      "Zoho Campaigns"
    ],
    "data": [
      [
        "contacts",
        "Contacts for campaigns",
        "Out",
        "contacts"
      ],
      [
        "leads",
        "Campaign leads",
        "In",
        "leads"
      ]
    ]
  },
  {
    "k": "projects",
    "name": "Project Management",
    "icon": "Kanban",
    "colors": [
      "#60a5fa",
      "#2563eb"
    ],
    "about": "Start a delivery project when a deal is won.",
    "providers": [
      "Unifiedtree Projects",
      "Asana",
      "Jira",
      "Trello",
      "Monday.com"
    ],
    "data": [
      [
        "deals",
        "Won deals",
        "Out",
        "deals"
      ],
      [
        "activities",
        "Tasks",
        "In",
        "activities"
      ]
    ]
  },
  {
    "k": "bi",
    "name": "Reports & BI",
    "icon": "ChartPie",
    "colors": [
      "#38bdf8",
      "#0369a1"
    ],
    "about": "Send sales numbers to your reporting tool.",
    "providers": [
      "Power BI",
      "Tableau",
      "Looker Studio",
      "Zoho Analytics"
    ],
    "data": [
      [
        "deals",
        "Deals",
        "Out",
        "deals"
      ],
      [
        "orders",
        "Orders",
        "Out",
        "orders"
      ],
      [
        "invoices",
        "Invoices",
        "Out",
        "invoices"
      ]
    ]
  },
  {
    "k": "payments",
    "name": "Payments",
    "icon": "CreditCard",
    "colors": [
      "#34d399",
      "#059669"
    ],
    "about": "See payments taken online against your invoices.",
    "providers": [
      "Stripe",
      "PayPal",
      "Adyen",
      "Razorpay",
      "Square"
    ],
    "data": [
      [
        "payments",
        "Payments received",
        "In",
        "payments"
      ],
      [
        "invoices",
        "Invoices to collect",
        "Out",
        "invoices"
      ]
    ]
  },
  {
    "k": "calendar",
    "name": "Calendar",
    "icon": "CalendarDays",
    "colors": [
      "#818cf8",
      "#4f46e5"
    ],
    "about": "Keep appointments the same in the CRM and people's calendars.",
    "providers": [
      "Google Calendar",
      "Outlook Calendar",
      "Apple Calendar"
    ],
    "data": [
      [
        "events",
        "Appointments",
        "In",
        "events"
      ]
    ]
  },
  {
    "k": "teamchat",
    "name": "Team Chat",
    "icon": "MessagesSquare",
    "colors": [
      "#f472b6",
      "#db2777"
    ],
    "about": "Post won deals and new leads to your team channel.",
    "providers": [
      "Slack",
      "Microsoft Teams",
      "Google Chat"
    ],
    "data": [
      [
        "deals",
        "Won deals",
        "Out",
        "deals"
      ],
      [
        "leads",
        "New leads",
        "Out",
        "leads"
      ]
    ]
  },
  {
    "k": "workflow",
    "name": "Workflow Tools",
    "icon": "Workflow",
    "colors": [
      "#fb923c",
      "#ea580c"
    ],
    "about": "Connect to thousands of other apps without building anything.",
    "providers": [
      "Zapier",
      "Make",
      "n8n",
      "Power Automate"
    ],
    "data": [
      [
        "leads",
        "Leads",
        "Out",
        "leads"
      ],
      [
        "deals",
        "Deals",
        "Out",
        "deals"
      ],
      [
        "contacts",
        "Contacts",
        "Out",
        "contacts"
      ]
    ]
  }
];

// The CRM's fields, with the name another system usually gives them.
export const FIELD_MAP = {
  "invoices": [
    [
      "number",
      "Invoice number",
      "invoice_no"
    ],
    [
      "date",
      "Date",
      "invoice_date"
    ],
    [
      "total",
      "Total",
      "amount_total"
    ],
    [
      "paid",
      "Paid",
      "amount_paid"
    ],
    [
      "status",
      "Status",
      "state"
    ]
  ],
  "payments": [
    [
      "number",
      "Payment number",
      "receipt_no"
    ],
    [
      "amount",
      "Amount",
      "amount"
    ],
    [
      "method",
      "Method",
      "payment_method"
    ],
    [
      "date",
      "Date",
      "paid_on"
    ]
  ],
  "products": [
    [
      "sku",
      "SKU",
      "item_code"
    ],
    [
      "name",
      "Name",
      "item_name"
    ],
    [
      "stock",
      "Stock",
      "qty_on_hand"
    ],
    [
      "price",
      "Price",
      "unit_price"
    ]
  ],
  "orders": [
    [
      "number",
      "Order number",
      "order_no"
    ],
    [
      "date",
      "Date",
      "order_date"
    ],
    [
      "total",
      "Total",
      "amount"
    ],
    [
      "status",
      "Status",
      "state"
    ]
  ],
  "shipments": [
    [
      "tracking",
      "Tracking number",
      "tracking_no"
    ],
    [
      "status",
      "Status",
      "state"
    ],
    [
      "eta",
      "Expected delivery",
      "eta_date"
    ]
  ],
  "leads": [
    [
      "name",
      "Name",
      "full_name"
    ],
    [
      "company",
      "Company",
      "company_name"
    ],
    [
      "email",
      "Email",
      "email_address"
    ],
    [
      "phone",
      "Phone",
      "phone_number"
    ]
  ],
  "contacts": [
    [
      "first",
      "First name",
      "first_name"
    ],
    [
      "last",
      "Last name",
      "last_name"
    ],
    [
      "email",
      "Email",
      "email_address"
    ],
    [
      "phone",
      "Phone",
      "phone_number"
    ]
  ],
  "deals": [
    [
      "title",
      "Opportunity",
      "deal_name"
    ],
    [
      "value",
      "Expected revenue",
      "amount"
    ],
    [
      "closeDate",
      "Expected closing",
      "close_date"
    ]
  ],
  "companies": [
    [
      "name",
      "Customer name",
      "account_name"
    ],
    [
      "email",
      "Email",
      "email_address"
    ],
    [
      "taxId",
      "Tax ID",
      "tax_number"
    ]
  ],
  "users": [
    [
      "name",
      "Name",
      "employee_name"
    ],
    [
      "email",
      "Email",
      "work_email"
    ],
    [
      "title",
      "Job title",
      "job_title"
    ]
  ],
  "activities": [
    [
      "summary",
      "Task",
      "task_name"
    ],
    [
      "due",
      "Due date",
      "due_on"
    ]
  ],
  "events": [
    [
      "title",
      "Title",
      "subject"
    ],
    [
      "start",
      "Starts",
      "start_time"
    ],
    [
      "end",
      "Ends",
      "end_time"
    ]
  ]
};
