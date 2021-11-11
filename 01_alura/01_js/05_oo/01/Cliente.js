

export class Cliente{
    nome;
    _cpf;

    get cpf() {
        //this._cpf; // no return produces undefined return
        return this._cpf;
    }

    constructor(nome, cpf) {
        this.nome =  nome;
        this._cpf = cpf; 
    }
}

