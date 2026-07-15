export interface EditableOutletPageBlock {
  id: string;
  type: string;
  title?: string;
  body?: string;
  image?: string;
  cta?: string;
}

export function syncHeroBlockImage(blocks: EditableOutletPageBlock[], heroUrl: string): EditableOutletPageBlock[] {
  const normalizedHeroUrl = heroUrl.trim();

  return blocks.map((block) => {
    if (block.type !== "hero") return block;
    const nextBlock = { ...block };
    if (normalizedHeroUrl) nextBlock.image = normalizedHeroUrl;
    else delete nextBlock.image;
    return nextBlock;
  });
}
