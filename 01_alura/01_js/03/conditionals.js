const destinos = new Array(`Marte`, `Jupiter`);

let idadeComprador = 21;

const estaAcompanhada = true;

let temPassagemComprada = true;

if (idadeComprador >= 18 || temPassagemComprada) {
    console.log("Comprador maior de idadade e tem passagem");
    destinos.splice(1, 1); // removendo item
} else if (estaAcompanhada == true) {
    console.log("Comprador está acompanhado");
    destinos.splice(1, 1); //removedo item
} else {
    console.log("Não é maior de idade e não posso vender");
}

console.log(destinos);