package bytebank;

public class Conta { //classe blueprint planta para crian��o de objetos
	double saldo;
	int agencia; //atributos
	int numero;
	Cliente titular;
	
	public void deposita(double valor) { //valor � um argumento do m�todo, m�todos lembram fun��es
		this.saldo += valor; //this quer dizer para o objeto espec�fico que chamou o metodo
	}
	
	public boolean saca(double valor) {
		if(this.saldo >= valor) {
			this.saldo -= valor; //this mais uma vez se referindo ao objeto que chamou o metodo
			return true;
		} else {
			return false;
		}
	}
	
	public boolean transfere(double valor, Conta destino) {
		if(this.saldo >= valor) {
			saca(valor);
			destino.deposita(valor);
			return true;
		}
		return false;  
		
	}
	
	
}
 