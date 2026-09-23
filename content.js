// All text, contact details and image paths for the site live in this file.
// The page is built from it — edit here, not in index.html.
//
// Facts must come from PROJECT.md. Do not add menu items, cuisines, prices,
// opening hours, room counts, amenities, hall capacity, email, WhatsApp or
// social links until they have been provided and recorded there.
//
// To add photos to a chapter, put the files in images/<slot>/ and list them in
// that chapter's `images` array, e.g.
//   images: [{ src: 'images/restaurant/restaurant-01.jpg', alt: 'The dining room' }]
// A chapter with an empty `images` array simply shows no photo strip.

export const content = {
  name: 'Yathvik Place',

  // What search engines and link previews show. After editing anything in
  // this file, run `node tools/build.mjs` (see README.md).
  site: {
    url: 'https://yathvikplacemoodbidri.com/',
    title: 'Yathvik Place Moodbidri | Restaurant, Rooms, Bar & Banquet Hall',
    description: 'Yathvik Place on Bantwala Road, Moodbidri: a multi-cuisine restaurant, modern stay rooms, a bar and a function & banquet hall. Call +91 63646 26664.',
    shareTitle: 'Yathvik Place, Moodbidri',
    shareDescription: 'Multi-cuisine restaurant, modern stay rooms, bar and function & banquet hall on Bantwala Road, Moodbidri.',
    shareImage: 'images/og/og.jpg',
    locale: 'en_IN',
    // schema.org types for Google's business listing data
    types: ['LocalBusiness', 'Hotel', 'Restaurant', 'BarOrPub', 'EventVenue'],
    servesCuisine: 'Multi-cuisine',
  },

  // Analytics is off until an ID is set. Paste a Google Analytics 4
  // measurement ID (looks like G-XXXXXXXXXX) to count visits and taps on the
  // Call and Directions buttons. It is public, not a secret.
  analytics: { ga4: '' },

  phones: [
    { display: '+91 63646 26664', tel: '+916364626664' },
    { display: '+91 90086 26663', tel: '+919008626663' },
  ],

  address: {
    lines: ['Near Maruti Suzuki Showroom', 'Bantwala Road, Moodbidri', 'Karnataka 574227'],
    oneLine: 'Near Maruti Suzuki Showroom, Bantwala Road, Moodbidri 574227',
    street: 'Near Maruti Suzuki Showroom, Bantwala Road',
    locality: 'Moodbidri',
    region: 'Karnataka',
    regionCode: 'IN-KA',
    postalCode: '574227',
    country: 'IN',
  },

  geo: { lat: 13.064638, lng: 75.004501 },

  maps: {
    link: 'https://maps.app.goo.gl/iWJNBYz5UcRricFZ9',
    embed: 'https://maps.google.com/maps?q=13.064638,75.004501&z=16&output=embed',
  },

  hero: {
    kicker: 'Bantwala Road · Moodbidri',
    lede: 'A multi-cuisine restaurant, modern stay rooms, a bar and a function hall, together at one address.',
    cue: 'Scroll to walk through',
  },

  // The order here is the order of the scroll chapters and of the camera
  // stops in js/chapters.js. `mood` sets the panel style: 'day' or 'night'.
  chapters: [
    {
      id: 'restaurant',
      slot: 'restaurant',
      nav: 'Dine',
      number: '01',
      kicker: 'By day',
      title: 'Multi-cuisine restaurant',
      body: 'A multi-cuisine restaurant in Moodbidri to sit down together, with family, with friends, or on your own.',
      note: 'Our menu is coming to this page soon. Until then, call us to book a table or ask about the menu.',
      action: 'Call to book a table',
      mood: 'day',
      images: [],
    },
    {
      id: 'stay',
      slot: 'rooms',
      nav: 'Stay',
      number: '02',
      kicker: 'Into the evening',
      title: 'Modern stay rooms',
      body: 'Modern rooms to stay the night, whether you are travelling through Moodbidri, visiting family, or in town for a function.',
      note: 'Room details and photos are coming to this page. Call us to check availability.',
      action: 'Call to check availability',
      mood: 'day',
      images: [],
    },
    {
      id: 'bar',
      slot: 'bar',
      nav: 'Bar',
      number: '03',
      kicker: 'After dark',
      title: 'The bar',
      body: 'A bar to unwind in at the end of the day, under the same roof as the restaurant and the rooms.',
      note: 'More about the bar is coming to this page. Call us if you would like to know more.',
      action: 'Call us',
      mood: 'night',
      images: [],
    },
    {
      id: 'hall',
      slot: 'hall',
      nav: 'Hall',
      number: '04',
      kicker: 'For the occasion',
      title: 'Function & banquet hall',
      body: 'A function and banquet hall in Moodbidri for the occasions worth gathering people for: celebrations, ceremonies and events.',
      note: 'Call us to ask about dates, and we will talk you through what the hall can host.',
      action: 'Call to ask about dates',
      mood: 'night',
      images: [],
    },
  ],

  visit: {
    nav: 'Visit',
    kicker: 'Visit us',
    title: 'Find us on Bantwala Road',
    directions: 'Get directions',
    callLabel: 'Call',
  },

  footer: {
    note: 'Restaurant · Stay rooms · Bar · Function & banquet hall',
    year: '2026',
  },
};
