const sample = [
  { id: 1, name: "바질 치킨 샌드위치", cost: 4500, price: 12000, category: "메인" },
  { id: 2, name: "트러플 감자튀김", cost: 2200, price: 7000, category: "사이드" },
  { id: 3, name: "시트러스 에이드", cost: 1200, price: 5500, category: "음료" },
];
let items = JSON.parse(localStorage.getItem("food-strategy-items") || "null") || sample;
const money = (value) => new Intl.NumberFormat("ko-KR").format(value) + "원";
const margin = (item) => item.price ? ((item.price - item.cost) / item.price) * 100 : 0;
const persist = () => localStorage.setItem("food-strategy-items", JSON.stringify(items));
function render() {
  const filter = document.querySelector("#filter").value;
  const visible = items.filter((item) => filter === "all" || item.category === filter);
  const list = document.querySelector("#menu-list");
  document.querySelector("#empty").hidden = visible.length > 0;
  list.innerHTML = visible.map((item) => {
    const rate = margin(item);
    return `<article class="menu-row"><div><div class="menu-name">${item.name}</div><div class="menu-meta">${item.category} · 원가 ${money(item.cost)} · 판매가 ${money(item.price)}</div></div><div class="margin ${rate >= 55 ? "good" : "warn"}">${rate.toFixed(1)}%</div><button class="remove" data-id="${item.id}" aria-label="${item.name} 삭제">×</button></article>`;
  }).join("");
  const average = items.length ? items.reduce((sum, item) => sum + margin(item), 0) / items.length : 0;
  const top = [...items].sort((a, b) => (b.price - b.cost) - (a.price - a.cost))[0];
  document.querySelector("#item-count").textContent = items.length;
  document.querySelector("#avg-margin").textContent = `${average.toFixed(1)}%`;
  document.querySelector("#top-item").textContent = top?.name || "—";
  list.querySelectorAll(".remove").forEach((button) => button.addEventListener("click", () => { items = items.filter((item) => item.id !== Number(button.dataset.id)); persist(); render(); }));
}
document.querySelector("#menu-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  items.push({ id: Date.now(), name: form.get("name") || document.querySelector("#name").value, cost: Number(document.querySelector("#cost").value), price: Number(document.querySelector("#price").value), category: document.querySelector("#category").value });
  persist(); event.currentTarget.reset(); render();
});
document.querySelector("#filter").addEventListener("change", render);
document.querySelector("#reset").addEventListener("click", () => { items = structuredClone(sample); persist(); render(); });
render();
