
export class Cliente{
    get cpf() {
        //this._cpf; // no return produces undefined return
        return this._cpf;
    }

    constructor(nome, cpf, senha) {
        this.nome =  nome;
        this._cpf = cpf; 
        this._senha = senha;
    }

    autenticar(){
        return true;
    }
}

