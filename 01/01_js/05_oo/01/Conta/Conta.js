import { Cliente } from "../Cliente.js";

//classe abstrata, somente existe para ser herdada
export class Conta{
    constructor(saldoInicial,cliente,agencia){
        
        if(this.constructor == Conta){
            throw new Error("A classe abstrata tipo Conta() não deve ser instaciado.")
        }
        this._saldo = saldoInicial;
        this._cliente = cliente;
        this._agencia = agencia;
    }

    set cliente(novoValor){
        if(novoValor instanceof Cliente){
            this._cliente = novoValor;
        }
    }

    get cliente(){
        return this._cliente;
    }

    //#saldo = 0;  //https://github.com/tc39/proposal-class-fields#private-fields

    get saldo(){
        return this._saldo;
    }

    sacar(valor){     
        throw new Error("Método abstrato sacar");
    }

    _sacar(valor,taxa){
        const valorSacado = Math.round(taxa * valor);
        console.log(`Valor Sacado: ${valorSacado} `)
        if(this._saldo >= valorSacado ){
            this._saldo -= valorSacado;
            return valorSacado;
        }
        return 0;
    }
    
    depositar(valor){
        if(valor <= 100) {
            return;
        } this._saldo += valor;
    }
    
    transferir(valor,conta){
        const valorSacado = this.sacar(valor);
        conta.depositar(valorSacado);
    }
}

