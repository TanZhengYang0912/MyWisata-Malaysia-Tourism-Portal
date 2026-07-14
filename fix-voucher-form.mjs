import fs from 'fs';

let content = fs.readFileSync('components/vendor/voucher-form.tsx', 'utf8');

content = content.replace(/useForm<any>/g, 'useForm<Record<string, unknown>>');
content = content.replace(/zodResolver\(voucherCreateSchema\) as any/g, 'zodResolver(voucherCreateSchema)');
content = content.replace(/async function onSubmit\(data: any\)/g, 'async function onSubmit(data: Record<string, unknown>)');
content = content.replace(/\(errors\.([a-zA-Z]+) as any\)\?\.message/g, '(errors.$1 as { message?: string })?.message');
content = content.replace(/<div className=\{watch\('voucherType'\) === 'bogo' \? 'hidden' : ''\}>/g, `\n          {/* eslint-disable-next-line react-hooks/incompatible-library */}\n          <div className={watch('voucherType') === 'bogo' ? 'hidden' : ''}>`);
content = content.replace(/\{watch\('voucherType'\) === 'bogo' && <div/g, `{/* eslint-disable-next-line react-hooks/incompatible-library */}\n        {watch('voucherType') === 'bogo' && <div`);

fs.writeFileSync('components/vendor/voucher-form.tsx', content);
