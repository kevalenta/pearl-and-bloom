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
 const checkout=document.getElementById('checkoutBtn');
 const checkoutOverlay=document.getElementById('checkoutOverlay');
 const checkoutForm=document.getElementById('orderCheckoutForm');
 const checkoutSummary=document.getElementById('checkoutSummary');
 const cancelCheckout=document.getElementById('cancelCheckout');
 const placeOrderBtn=document.getElementById('placeOrderBtn');
 const checkoutError=document.getElementById('checkoutError');
 const confirmBox=document.getElementById('orderConfirmOverlay');
 const numberBox=document.getElementById('newOrderNumber');
 const done=document.getElementById('closeOrderConfirm');
 const orderEmailEndpoint='https://formsubmit.co/ajax/pearlandbloom.us@gmail.com';

 function makeOrderNumber(){
   const stamp=Date.now().toString().slice(-5);
   const random=Math.floor(10+Math.random()*90);
   return 'PB-'+stamp+random;
 }
 function orderTotal(){return cart.reduce((a,b)=>a+b.price,0);}
 function orderItemsText(){return cart.map((x,i)=>`${i+1}. ${x.name} — $${x.price.toFixed(2)}`).join('\n');}
 function showCheckout(){
   if(!cart.length){alert('Your cart is empty! 🌸');return;}
   checkoutSummary.innerHTML='<strong>Order:</strong><br>'+cart.map(x=>`${x.name} — $${x.price.toFixed(2)}`).join('<br>')+`<br><br><strong>Total: $${orderTotal().toFixed(2)}</strong>`;
   checkoutError.style.display='none';
   checkoutOverlay.classList.add('open');
   checkoutOverlay.setAttribute('aria-hidden','false');
 }
 function hideCheckout(){checkoutOverlay.classList.remove('open');checkoutOverlay.setAttribute('aria-hidden','true');}
 if(checkout) checkout.addEventListener('click',showCheckout);
 if(cancelCheckout) cancelCheckout.addEventListener('click',hideCheckout);
 if(checkoutOverlay) checkoutOverlay.addEventListener('click',e=>{if(e.target===checkoutOverlay)hideCheckout();});

 if(checkoutForm){
   checkoutForm.addEventListener('submit',function(e){
     if(location.protocol==='file:'){
       e.preventDefault();
       checkoutError.textContent='Email checkout cannot send while this page is opened as a file. Use the Start Pearl & Bloom file so the address begins with http://localhost:8000.';
       checkoutError.style.display='block';
       return;
     }
     if(!cart.length){
       e.preventDefault();
       hideCheckout();
       alert('Your cart is empty! 🌸');
       return;
     }
     document.getElementById('fsUrl').value=location.href;
     const orderNumber=makeOrderNumber();
     document.getElementById('fsSubject').value=`New Pearl & Bloom Order ${orderNumber}`;
     document.getElementById('fsReplyTo').value=document.getElementById('orderEmail').value.trim();
     document.getElementById('fsOrderNumber').value=orderNumber;
     document.getElementById('fsItems').value=orderItemsText();
     document.getElementById('fsTotal').value=`$${orderTotal().toFixed(2)}`;

     placeOrderBtn.textContent='Sending...';
     checkoutForm.classList.add('checkout-sending');
     checkoutError.style.display='none';

     const saved=JSON.parse(localStorage.getItem('pearlBloomOrders')||'[]');
     saved.push({
       number:orderNumber,
       total:orderTotal(),
       items:[...cart],
       customer:document.getElementById('orderName').value.trim(),
       email:document.getElementById('orderEmail').value.trim(),
       address:document.getElementById('orderAddress').value.trim(),
       city:document.getElementById('orderCity').value.trim(),
       state:document.getElementById('orderState').value.trim(),
       zip:document.getElementById('orderZip').value.trim(),
       date:new Date().toISOString()
     });
     localStorage.setItem('pearlBloomOrders',JSON.stringify(saved));

     // The browser now performs a normal POST to FormSubmit.
     // FormSubmit will show its confirmation/activation page after the submission.
   });
 }
 if(done) done.addEventListener('click',function(){
   confirmBox.classList.remove('open');
   cart.length=0; renderCart(); closeCart();
 });
})();
