import {Cliente} from "./Cliente.js"
import {ContaCorrente} from "./ContaCorrente.js"

const cliente1 = new Cliente("Ricardo",11122233309);     

const cliente2 = new Cliente("Alice",22233309);     

console.log(cliente1);
console.log(cliente2);


const contaCorrenteRicardo = new ContaCorrente(cliente1, 1001);
/*
contaCorrenteRicardo._saldo = 0; //acessando direto um atributo privado
contaCorrenteRicardo.agencia = 1001;
contaCorrenteRicardo.cliente = cliente1;
*/
console.log(contaCorrenteRicardo.saldo);

contaCorrenteRicardo.depositar(100);
/*
const valorSacado = contaCorrenteRicardo.sacar(40);
console.log(valorSacado);
*/
console.log(contaCorrenteRicardo);

contaCorrenteRicardo.depositar(500);

const conta2 = new ContaCorrente();
conta2.cliente = new Cliente();
conta2.cliente = cliente2;
conta2.agencia = 102;
/*
conta2.cliente.nome = "Alice";
conta2.cliente.cpf = 22233309;
*/
let valor = 300;
contaCorrenteRicardo.transferir(valor,conta2);

console.log(conta2);
console.log(contaCorrenteRicardo);

const conta3 = new ContaCorrente(102, cliente2);
//conta3.cliente = cliente2;

console.log(conta2.saldo);

console.log(cliente1.cpf);

console.log(ContaCorrente.numeroDeContas);