import { test,expect,type APIRequestContext } from '@playwright/test';
const origin='http://127.0.0.1:'+(process.env.CK_PORT || '3000');
const raw={supplierId:'101',buyer:'QA review',date:'2026-10-11',reference:'QA approval fixture',notes:'',warehouse:'',po:'',vatMode:'exclusive',discount:'0',items:[{productId:'201',quantity:'1',price:'8.50'}]};
async function login(r: APIRequestContext,user: string) {
 const csrf=await(await r.get('/api/auth/csrf')).json();
 await r.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,user,callbackUrl:origin,json:'true'}});
}
const post=(r: APIRequestContext,path: string,data: unknown)=>r.post(path,{headers:{Origin:origin},data});
test('review screen, self approval and reopening preserve approved version on mobile/tablet',async({page})=>{
 await login(page.request,'mock-approver');
 let d=await(await post(page.request,'/api/receipts',raw)).json();
 d=await(await post(page.request,`/api/receipts/${d.id}/request-review`,{version:d.version})).json();
 await page.goto('/');
 await page.locator('.receipt').filter({hasText:'QA approval fixture'}).first().click();
 await expect(page.locator('.review')).toContainText('QA review');
 await expect(page.locator('.review')).toContainText('9.10');
 await page.getByRole('button',{name:'อนุมัติพร้อมส่ง',exact:true}).click();
 await expect(page.locator('.badge.approved').first()).toContainText('อนุมัติพร้อมส่ง');
 const approved=await(await page.request.get(`/api/receipts/${d.id}`)).json();
 await page.reload();await page.locator('.receipt').filter({hasText:'QA approval fixture'}).first().click();
 await expect(page.locator('.review')).toBeVisible();
 expect((await(await page.request.get(`/api/receipts/${d.id}`)).json()).version).toBe(approved.version);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const stale=await page.request.put(`/api/receipts/${d.id}`,{headers:{Origin:origin},data:{draft:{...raw,buyer:'stale'},version:approved.version-1}});expect(stale.status()).toBe(409);
 const changed=await page.request.put(`/api/receipts/${d.id}`,{headers:{Origin:origin},data:{draft:{...raw,buyer:'edited'},version:approved.version}});expect((await changed.json()).status).toBe('draft');
});
test('reviewer cannot approve; return requires reason; concurrent cancel is single transition',async({request})=>{
 await login(request,'mock-reviewer');
 let d=await(await post(request,'/api/receipts',raw)).json();
 d=await(await post(request,`/api/receipts/${d.id}/request-review`,{version:d.version})).json();
 expect((await post(request,`/api/receipts/${d.id}/approve`,{version:d.version})).status()).toBe(403);
 expect((await post(request,`/api/receipts/${d.id}/return`,{version:d.version})).status()).toBe(400);
 d=await(await post(request,`/api/receipts/${d.id}/return`,{version:d.version,reason:'fix price'})).json();expect(d.status).toBe('draft');
 d=await(await post(request,`/api/receipts/${d.id}/request-review`,{version:d.version})).json();
 const rs=await Promise.all([post(request,`/api/receipts/${d.id}/cancel-review`,{version:d.version}),post(request,`/api/receipts/${d.id}/cancel-review`,{version:d.version})]);expect(rs.map(r=>r.status()).sort()).toEqual([200,409]);
 await login(request,'mock-sender');expect((await post(request,'/api/receipts',raw)).status()).toBe(403);
});
