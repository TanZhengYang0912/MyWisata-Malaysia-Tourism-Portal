export function getProductDetailsLayoutClasses() {
  return {
    page: 'space-y-5',
    content: 'space-y-5',
    actions: 'sticky top-4 z-20',
    heroMedia: 'aspect-[4/3] min-h-0',
    heroContent: 'flex flex-col justify-center',
    localNav: 'sticky top-24 z-10',
    section: 'rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-7',
    pricing: 'mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4',
  } as const;
}
