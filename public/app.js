const cart=[];
const cartDrawer=document.getElementById('cartDrawer');
const overlay=document.getElementById('overlay');
const cartItems=document.getElementById('cartItems');
const cartTotal=document.getElementById('cartTotal');
const cartCount=document.getElementById('cartCount');

function openCart(){
  if(cartDrawer) cartDrawer.classList.add('open');
  if(overlay) overlay.classList.add('open');
}
function closeCart(){
  if(cartDrawer) cartDrawer.classList.remove('open');
  if(overlay) overlay.classList.remove('open');
}

const cartOpen=document.getElementById('cartOpen');
const cartClose=document.getElementById('cartClose');
if(cartOpen) cartOpen.addEventListener('click',openCart);
if(cartClose) cartClose.addEventListener('click',closeCart);
if(overlay) overlay.addEventListener('click',closeCart);

function renderCart(){
  if(cartCount) cartCount.textContent=cart.length;
  if(!cartItems || !cartTotal) return;
  if(!cart.length){
    cartItems.innerHTML='<p>Your cart is empty.</p>';
    cartTotal.textContent='$0.00';
    return;
  }
  cartItems.innerHTML=cart.map((x,i)=>`<div class="cart-row"><span>${x.name}</span><span>$${x.price.toFixed(2)} <button onclick="removeItem(${i})">×</button></span></div>`).join('');
  cartTotal.textContent='$'+cart.reduce((a,b)=>a+b.price,0).toFixed(2);
}
window.removeItem=i=>{cart.splice(i,1);renderCart();};

document.querySelectorAll('.add-btn[data-product]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    cart.push({name:btn.dataset.product,price:Number(btn.dataset.price)});
    renderCart();
    openCart();
  });
});

const customForm=document.getElementById('customForm');
if(customForm){
  customForm.addEventListener('submit',e=>{
    e.preventDefault();
    const item=document.getElementById('customItem')?.value || 'Bracelet';
    const colors=document.getElementById('customColors')?.value || '';
    const textValue=(document.getElementById('customText')?.value || '').trim();
    const charms=document.getElementById('customCharms')?.value || '';
    const base={Bracelet:10,Necklace:16,Keychain:8}[item] || 0;
    cart.push({name:`Custom ${item} — ${colors}${charms?' — Charms: '+charms:''}${textValue?' — '+textValue:''}`,price:base+(textValue?1:0)});
    renderCart();
    openCart();
    e.target.reset();
  });
}

const searchInput=document.getElementById('searchInput');
if(searchInput){
  searchInput.addEventListener('input',e=>{
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('.product-card').forEach(card=>{
      card.style.display=(card.dataset.name || '').toLowerCase().includes(q)?'block':'none';
    });
  });
}

document.querySelectorAll('.filter').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const f=btn.dataset.filter;
    let visibleCount=0;
    document.querySelectorAll('.product-card').forEach(card=>{
      const show=(f==='all'||card.dataset.category===f);
      card.style.display=show?'block':'none';
      if(show) visibleCount++;
    });
    let msg=document.getElementById('comingSoonMessage');
    if(!msg){
      msg=document.createElement('div');
      msg.id='comingSoonMessage';
      msg.style.cssText='display:none;grid-column:1/-1;text-align:center;padding:55px 20px;font-size:28px;font-weight:700;color:#8b6f87;background:#fff7fb;border-radius:24px;border:2px dashed #f2c9dc;';
      msg.innerHTML='Coming soon! ♡<div style="font-size:15px;font-weight:400;margin-top:8px;color:#9b8998">New Pearl &amp; Bloom goodies are on the way.</div>';
      document.getElementById('productGrid').appendChild(msg);
    }
    msg.style.display=(f!=='all' && visibleCount===0)?'block':'none';
  });
});

renderCart();

document.querySelectorAll('.fav-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    btn.classList.toggle('saved');
    btn.textContent=btn.classList.contains('saved')?'♥':'♡';
  });
});
const selectedColors=[];
document.querySelectorAll('.color-dot').forEach(dot=>{
  dot.addEventListener('click',()=>{
    const color=dot.dataset.color;
    dot.classList.toggle('selected');
    if(dot.classList.contains('selected')) selectedColors.push(color);
    else {
      const i=selectedColors.indexOf(color);
      if(i>-1) selectedColors.splice(i,1);
    }
    document.getElementById('customColors').value=selectedColors.join(', ');
  });
});
const giftCheck=document.getElementById('giftCheck');
const giftWrap=document.getElementById('giftMessageWrap');
if(giftCheck) giftCheck.addEventListener('change',()=>giftWrap.style.display=giftCheck.checked?'grid':'none');

const selectedCharms=[];
document.querySelectorAll('.charm-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const charm=btn.dataset.charm;
    btn.classList.toggle('selected');
    if(btn.classList.contains('selected')) selectedCharms.push(charm);
    else{
      const i=selectedCharms.indexOf(charm);
      if(i>-1) selectedCharms.splice(i,1);
    }
    document.getElementById('customCharms').value=selectedCharms.join(', ');
  });
});

(function(){
 // ---- Checkout: send the order to our own backend (/api/order) ----
 const checkout=document.getElementById('checkoutBtn');
 const checkoutOverlay=document.getElementById('checkoutOverlay');
 const checkoutForm=document.getElementById('orderCheckoutForm');
 const checkoutSummary=document.getElementById('checkoutSummary');
 const cancelCheckout=document.getElementById('cancelCheckout');
 const placeOrderBtn=document.getElementById('placeOrderBtn');
 const checkoutError=document.getElementById('checkoutError');
 const confirmBox=document.getElementById('orderConfirmOverlay');
 const numberBox=document.getElementById('newOrderNumber');
 const payBox=document.getElementById('payBox');
 const done=document.getElementById('closeOrderConfirm');

 // Fill these in when the Venmo QR is ready: image goes in img/venmo-qr.png
 const VENMO_HANDLE='@Melissa-Valenta-1';
 const VENMO_QR='img/venmo-qr.png';

 // The three ways an order can get to you. The same list lives in src/index.js,
 // and the price the customer really pays is the one the server looks up there.
 const SHIPPING={
   local:{label:'Free local delivery (Palmas Del Mar)',price:0},
   first:{label:'First Class Mail (not trackable)',price:2},
   ground:{label:'USPS Ground Advantage (trackable)',price:7}
 };
 const shippingInputs=document.querySelectorAll('#shippingChoices input[name="shipping"]');

 function pickedShipping(){
   const chosen=document.querySelector('#shippingChoices input[name="shipping"]:checked');
   return chosen?chosen.value:'';
 }
 function subtotal(){return cart.reduce((a,b)=>a+b.price,0);}
 function shippingCost(){return SHIPPING[pickedShipping()]?SHIPPING[pickedShipping()].price:0;}
 function orderTotal(){return subtotal()+shippingCost();}
 function showError(msg){checkoutError.textContent=msg;checkoutError.style.display='block';}

 function renderSummary(){
   const key=pickedShipping();
   const ship=key?`${SHIPPING[key].label} — $${SHIPPING[key].price.toFixed(2)}`:'Pick one above';
   checkoutSummary.innerHTML='<strong>Order:</strong><br>'
     +cart.map(x=>`${x.name} — $${x.price.toFixed(2)}`).join('<br>')
     +`<br><br>Subtotal: $${subtotal().toFixed(2)}<br>Shipping: ${ship}`
     +`<br><br><strong>Total: $${orderTotal().toFixed(2)}</strong>`;
 }
 shippingInputs.forEach(input=>input.addEventListener('change',renderSummary));

 function showCheckout(){
   if(!cart.length){alert('Your cart is empty! 🌸');return;}
   renderSummary();
   checkoutError.style.display='none';
   checkoutOverlay.classList.add('open');
   checkoutOverlay.setAttribute('aria-hidden','false');
 }
 function hideCheckout(){checkoutOverlay.classList.remove('open');checkoutOverlay.setAttribute('aria-hidden','true');}
 if(checkout) checkout.addEventListener('click',showCheckout);
 if(cancelCheckout) cancelCheckout.addEventListener('click',hideCheckout);
 if(checkoutOverlay) checkoutOverlay.addEventListener('click',e=>{if(e.target===checkoutOverlay)hideCheckout();});

 function showConfirmation(number,total){
   numberBox.textContent=number;
   if(VENMO_HANDLE){
     const payUrl=`https://venmo.com/${VENMO_HANDLE.replace('@','')}?txn=pay&amount=${total.toFixed(2)}&note=${encodeURIComponent(number)}`;
     payBox.innerHTML=`<p><strong>Total: $${total.toFixed(2)}</strong></p><p>Pay with Venmo to <strong>${VENMO_HANDLE}</strong> and put <strong>${number}</strong> in the note.</p><p><a class="primary venmo-btn" href="${payUrl}" target="_blank" rel="noopener">Open Venmo to pay</a></p><img src="${VENMO_QR}" alt="Venmo QR code for ${VENMO_HANDLE}" class="venmo-qr">`;
   } else {
     payBox.innerHTML=`<p><strong>Total: $${total.toFixed(2)}</strong></p><p>We'll email you about payment and shipping. 💕</p>`;
   }
   hideCheckout();
   confirmBox.classList.add('open');
 }

 if(checkoutForm){
   checkoutForm.addEventListener('submit',async function(e){
     e.preventDefault();
     if(!cart.length){hideCheckout();alert('Your cart is empty! 🌸');return;}
     const val=id=>document.getElementById(id).value.trim();
     const order={
       customer:val('orderName'), email:val('orderEmail'), phone:val('orderPhone'),
       address:val('orderAddress'), city:val('orderCity'), state:val('orderState'), zip:val('orderZip'),
       notes:val('orderNotes'), website:val('orderWebsite'),
       shipping:pickedShipping(),
       items:cart.map(x=>({name:x.name,price:x.price}))
     };
     if(!order.customer||!order.email.includes('@')||!order.address||!order.city||!order.state||!order.zip){
       showError('Please fill in every shipping field.');return;
     }
     if(!order.shipping){
       showError('Please pick a shipping option.');return;
     }
     placeOrderBtn.disabled=true; placeOrderBtn.textContent='Sending...';
     checkoutError.style.display='none';
     try{
       const res=await fetch('/api/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(order)});
       const data=await res.json();
       if(!res.ok||!data.ok) throw new Error(data.error||'Something went wrong.');
       showConfirmation(data.number,data.total);
       checkoutForm.reset();
       renderSummary();
     }catch(err){
       showError(err.message||"We couldn't send the order. Please try again.");
     }finally{
       placeOrderBtn.disabled=false; placeOrderBtn.textContent='Place order';
     }
   });
 }
 if(done) done.addEventListener('click',function(){
   confirmBox.classList.remove('open');
   cart.length=0; renderCart(); closeCart();
 });

 // ---- Track an order ----
 const trackForm=document.getElementById('trackForm');
 const trackResult=document.getElementById('trackResult');
 if(trackForm){
   trackForm.addEventListener('submit',async function(e){
     e.preventDefault();
     const number=document.getElementById('trackNumber').value.trim();
     const email=document.getElementById('trackEmail').value.trim();
     trackResult.hidden=false; trackResult.textContent='Looking...';
     try{
       const res=await fetch(`/api/order?number=${encodeURIComponent(number)}&email=${encodeURIComponent(email)}`);
       const data=await res.json();
       if(!res.ok) throw new Error(data.error||'Not found.');
       const when=new Date(data.placed).toLocaleDateString();
       const labels={new:'Received 🌸',paid:'Paid 💕',shipped:'Shipped 📬',done:'Delivered ✨'};
       const shipLine=data.shipping?`<br>Shipping: ${data.shipping} — $${data.shippingCost.toFixed(2)}`:'';
       trackResult.innerHTML=`<strong>${data.number}</strong> · placed ${when}<br>Status: <strong>${labels[data.status]||data.status}</strong><br>`+data.items.map(i=>`${i.name} — $${i.price.toFixed(2)}`).join('<br>')+shipLine+`<br><strong>Total: $${data.total.toFixed(2)}</strong>`;
     }catch(err){
       trackResult.textContent=err.message||'Something went wrong.';
     }
   });
 }
})();
